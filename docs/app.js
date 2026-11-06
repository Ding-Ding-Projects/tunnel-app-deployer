'use strict';
const descriptions = {
  dockerfile: [
    ['Choose your project', 'Select the Dockerfile and its build context. Keep the project on your computer; the documentation page never uploads it.'],
    ['Check the web port', 'Use the single exposed TCP port when it is unambiguous, or select the port your application listens on. The container must listen on all container interfaces.'],
    ['Host and verify', 'Host builds and starts the container, checks its local endpoint, creates a Quick Tunnel, and verifies the public HTTPS endpoint.'],
    ['Share while running', 'Copy the verified link. Keep the hosting computer and app running. Stop sharing ends this session; a later session can have a different URL.']
  ],
  compose: [
    ['Choose the Compose file', 'Select compose.yaml or docker-compose.yml. Inspect all services and select the web service you want visitors to reach.'],
    ['Review the detected services', 'Keep dependency services internal. Unsupported settings must be reported before startup; they must never be silently dropped.'],
    ['Start the project', 'Host starts an isolated app-owned Compose project, verifies the selected web service, then creates and verifies the public tunnel.'],
    ['Share and preserve data', 'Copy the verified link. Stopping sharing must preserve persistent volumes and unrelated projects. The link works only while the local session is running.']
  ]
};
let step = 0;
function render() { const format = document.querySelector('input[name="format"]:checked').value; const [title, description] = descriptions[format][step]; document.getElementById('step-count').textContent = `STEP ${step + 1} OF 4`; document.getElementById('step-title').textContent = title; document.getElementById('step-description').textContent = description; document.getElementById('previous').disabled = step === 0; document.getElementById('next').disabled = step === 3; }
document.getElementById('previous').addEventListener('click', () => { if (step > 0) step--; render(); });
document.getElementById('next').addEventListener('click', () => { if (step < 3) step++; render(); });
for (const radio of document.querySelectorAll('input[name="format"]')) radio.addEventListener('change', () => { step = 0; render(); });
for (const check of document.querySelectorAll('[data-check]')) { try { check.checked = localStorage.getItem(`tunnel-docs:${check.dataset.check}`) === 'true'; } catch {} check.addEventListener('change', () => { try { localStorage.setItem(`tunnel-docs:${check.dataset.check}`, String(check.checked)); } catch {} }); }
document.getElementById('reset').addEventListener('click', () => { for (const check of document.querySelectorAll('[data-check]')) { check.checked = false; try { localStorage.removeItem(`tunnel-docs:${check.dataset.check}`); } catch {} } });
render();
