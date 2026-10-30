/* Cookie consent for Google Analytics (LND-098). The consent default in the analytics partial
   keeps analytics storage denied in the EEA, the UK and Switzerland until the visitor accepts.
   The banner shows when the browser timezone is in those regions and no choice is stored.
   A "Cookie settings" link opens it again. */
(function consent() {
  'use strict';

  const KEY = 'nellis-consent';
  /* Europe/* also covers some countries outside the regions: an extra banner is safe. */
  const ISLANDS = ['Atlantic/Azores', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Madeira',
    'Atlantic/Reykjavik', 'Arctic/Longyearbyen', 'Africa/Ceuta', 'Asia/Nicosia', 'Asia/Famagusta'];
  let banner = null;

  function inRegion(timeZone) {
    const zone = String(timeZone || '');
    return zone.startsWith('Europe/') || ISLANDS.includes(zone);
  }

  function stored() {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function choose(value) {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* Private mode: the choice lasts for this page only. */
    }
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: value });
    }
    banner.hidden = true;
  }

  function show() {
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'consentBanner';
      banner.setAttribute('role', 'region');
      banner.setAttribute('aria-label', 'Cookie consent');
      banner.innerHTML = '<p>We use analytics cookies. <a href="/privacy/">Privacy policy</a></p>'
        + '<div class="consentBanner__buttons">'
        + '<button type="button" data-consent="granted">Accept</button>'
        + '<button type="button" data-consent="denied">Decline</button></div>';
      banner.addEventListener('click', (e) => {
        const button = e.target.closest('[data-consent]');
        if (button) choose(button.getAttribute('data-consent'));
      });
      document.body.appendChild(banner);
    }
    banner.hidden = false;
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cookieSettings')) return;
    e.preventDefault();
    show();
  });

  window.NellisConsent = { inRegion, show };
  if (inRegion(Intl.DateTimeFormat().resolvedOptions().timeZone) && !stored()) show();
}());
