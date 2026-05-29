document
  .getElementById('subscribe-form')
  .addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const repo = document.getElementById('repo').value;
    const submitButton = document.querySelector(
      '[data-testid="submit-button"]',
    );
    const messageBox = document.getElementById('message-box');

    messageBox.className = 'hidden';
    messageBox.textContent = '';
    submitButton.disabled = true;
    submitButton.textContent = 'Loading...';

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, repo }),
      });

      const data = await response.json();

      if (response.ok) {
        messageBox.textContent =
          data.message || 'Success! Please check your email to confirm.';
        messageBox.className = 'success';
        document.getElementById('subscribe-form').reset();
      } else {
        messageBox.textContent =
          data.data?.message || data.message || 'An error occurred';
        messageBox.className = 'error';
      }
    } catch {
      messageBox.textContent = 'Network error. Please try again later.';
      messageBox.className = 'error';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Subscribe';
    }
  });
