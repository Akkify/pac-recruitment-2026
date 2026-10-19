const fs = require('fs');
const assert = require('assert');

// 1. Verify logo assets exist in both root and PAC-Public
assert(fs.existsSync('assets/pac-logo.png'), 'assets/pac-logo.png missing');
assert(fs.existsSync('assets/pac-logo-raw.jpg'), 'assets/pac-logo-raw.jpg missing');
assert(fs.existsSync('PAC-Public/assets/pac-logo.png'), 'PAC-Public/assets/pac-logo.png missing');
assert(fs.existsSync('PAC-Public/assets/pac-logo-raw.jpg'), 'PAC-Public/assets/pac-logo-raw.jpg missing');

// 2. Verify HTML integration
['index.html', 'PAC-Public/index.html'].forEach(path => {
  const html = fs.readFileSync(path, 'utf8');
  assert(html.includes('assets/pac-logo.png'), `${path} missing assets/pac-logo.png`);
  assert(html.includes('id="pac-intro-overlay"'), `${path} missing intro overlay element`);
  assert(html.includes('class="brand-logo-img"'), `${path} missing brand-logo-img`);
  assert(html.includes('class="ticket-logo-img"'), `${path} missing ticket-logo-img`);
  assert(html.includes('rel="icon"'), `${path} missing favicon link`);
});

// 3. Verify CSS keyframes and animations
['css/styles.css', 'PAC-Public/css/styles.css'].forEach(path => {
  const css = fs.readFileSync(path, 'utf8');
  assert(css.includes('.intro-overlay'), `${path} missing .intro-overlay`);
  assert(css.includes('@keyframes introLogoPop'), `${path} missing @keyframes introLogoPop`);
  assert(css.includes('@keyframes introGlowPulse'), `${path} missing @keyframes introGlowPulse`);
  assert(css.includes('@keyframes introSweepSpin'), `${path} missing @keyframes introSweepSpin`);
  assert(css.includes('prefers-reduced-motion'), `${path} missing prefers-reduced-motion`);
});

// 4. Verify JS controller
['js/app.js', 'PAC-Public/js/app.js'].forEach(path => {
  const js = fs.readFileSync(path, 'utf8');
  assert(js.includes('initIntroAnimation'), `${path} missing initIntroAnimation`);
  assert(js.includes('introOverlay: document.getElementById(\'pac-intro-overlay\')'), `${path} missing DOM introOverlay reference`);
  assert(!js.includes('sessionStorage.getItem') && !js.includes('sessionStorage.setItem'), `${path} should not use sessionStorage`);
  assert(!js.includes('localStorage.getItem') && !js.includes('localStorage.setItem'), `${path} should not use localStorage`);
  assert(js.includes('prefers-reduced-motion'), `${path} missing prefers-reduced-motion check`);
  assert(js.includes('2600'), `${path} missing 2.6s intro timer`);
  assert(js.includes('3500'), `${path} missing fail-safe timer`);
});

console.log('✔ All asset, markup, styling, and JS controller assertions PASSED successfully!');
