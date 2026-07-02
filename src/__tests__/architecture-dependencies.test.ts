import { expect, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { filesOfProject } from 'tsarch';

const architectureTsConfig = 'tsconfig.architecture.json';

const sourceFiles = () => filesOfProject(architectureTsConfig);

const expectRuleToPass = async (rule: { check(): Promise<unknown[]> }) => {
  const violations = await rule.check();
  expect(violations).toEqual([]);
};

const forbiddenFrameworkList = [
  '@bull-board/api',
  '@bull-board/express',
  '@grpc/grpc-js',
  '@prisma/adapter-pg',
  '@prisma/client',
  'axios',
  'bullmq',
  'express',
  'ioredis',
  'nodemailer',
  'pg',
  'prom-client',
  'swagger-ui-express',
];

const forbiddenFrameworkSpecifiers = new Set(forbiddenFrameworkList);

const forbiddenFrameworks = `(?:${forbiddenFrameworkList.join('|')})`;

const ignoredDirectories = new Set([
  'node_modules',
  'dist',
  'generated',
  'coverage',
]);

const projectRoot = process.cwd();

const collectTypeScriptFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts')) files.push(entryPath);
  }

  return files;
};

const getBareImportSpecifiers = (filePath: string): string[] => {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  const imports: string[] = [];

  ts.forEachChild(source, (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.moduleSpecifier.text.startsWith('.')
    ) {
      imports.push(node.moduleSpecifier.text);
    }
  });

  return imports;
};

const expectNoForbiddenFrameworkImports = (filePattern: RegExp) => {
  const violations = collectTypeScriptFiles(projectRoot)
    .map((filePath) =>
      path.relative(projectRoot, filePath).split(path.sep).join('/'),
    )
    .filter((relativePath) => filePattern.test(relativePath))
    .flatMap((relativePath) =>
      getBareImportSpecifiers(path.join(projectRoot, relativePath))
        .filter((specifier) => forbiddenFrameworkSpecifiers.has(specifier))
        .map((specifier) => `${relativePath} -> ${specifier}`),
    );

  expect(violations).toEqual([]);
};

describe('architecture dependency rules', () => {
  jest.setTimeout(30000);

  it('keeps Main API domain files independent from infrastructure frameworks', async () => {
    const rule = sourceFiles()
      .matchingPattern(
        'src/(modules/.+\\.entity|modules/.+\\.port|shared/errors)\\.ts',
      )
      .shouldNot()
      .dependOnFiles()
      .matchingPattern(forbiddenFrameworks);

    await expectRuleToPass(rule);
    expectNoForbiddenFrameworkImports(
      /^src\/(?:modules\/.+\.(?:entity|port)|shared\/errors)\.ts$/,
    );
  });

  it('keeps GitHub Scanner domain files independent from infrastructure frameworks', async () => {
    const rule = sourceFiles()
      .inFolder('services/github-scanner-service/src/domain')
      .shouldNot()
      .dependOnFiles()
      .matchingPattern(forbiddenFrameworks);

    await expectRuleToPass(rule);
    expectNoForbiddenFrameworkImports(
      /^services\/github-scanner-service\/src\/domain\/.+\.ts$/,
    );
  });

  it('keeps GitHub Scanner application layer away from transport and adapter code', async () => {
    const rule = sourceFiles()
      .inFolder('services/github-scanner-service/src/app')
      .shouldNot()
      .dependOnFiles()
      .matchingPattern(
        'services/github-scanner-service/src/(cache|controllers|db|generated|github|grpc|middleware|publishers|repositories|routes|workers)/',
      );

    await expectRuleToPass(rule);
  });

  it('keeps Main API use cases independent from Express transport code', async () => {
    const rule = sourceFiles()
      .matchingPattern(
        'src/modules/(?!.*(?:\\.controller|\\.repository|\\.routes|\\.schema|\\.worker)\\.ts).+\\.ts',
      )
      .shouldNot()
      .dependOnFiles()
      .matchingPattern('src/(routes|middleware|containers)/|(?:express)');

    await expectRuleToPass(rule);
  });

  it('prevents Main API infrastructure from depending on presentation files', async () => {
    const rule = sourceFiles()
      .matchingPattern('src/(infrastructure|queue)/.+\\.ts')
      .shouldNot()
      .dependOnFiles()
      .matchingPattern(
        'src/(routes|middleware)/|src/modules/.+\\.(?:controller|routes|schema)\\.ts',
      );

    await expectRuleToPass(rule);
  });

  it('keeps Notification Service isolated from Main API and Scanner implementation code', async () => {
    const rule = sourceFiles()
      .inFolder('services/notification-service/src')
      .shouldNot()
      .dependOnFiles()
      .matchingPattern('src/|services/github-scanner-service/src/');

    await expectRuleToPass(rule);
  });

  it('keeps GitHub Scanner Service isolated from Main API and Notification implementation code', async () => {
    const rule = sourceFiles()
      .inFolder('services/github-scanner-service/src')
      .shouldNot()
      .dependOnFiles()
      .matchingPattern('src/|services/notification-service/src/');

    await expectRuleToPass(rule);
  });

  it('keeps shared packages free from application and service implementation code', async () => {
    const rule = sourceFiles()
      .inFolder('packages')
      .shouldNot()
      .dependOnFiles()
      .matchingPattern('src/|services/');

    await expectRuleToPass(rule);
  });
});
