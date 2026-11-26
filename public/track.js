// track.js – Meta Pixel (browser side). Everything here is a safe no-op unless a Pixel id is configured,
// so with no id set the site makes NO request to Meta and the rest of the app works exactly the same.
//
// The id arrives from /api/pixel-config (loaded just before this file) as window.META_PIXEL_ID.
// app.js calls  track('EventName', {...}, eventId)  and  trackCustom('EventName').
(function () {
  var id = window.META_PIXEL_ID;

  window.track = function () {};
  window.trackCustom = function () {};

  // Read a cookie (used to pass Meta's _fbp / _fbc browser ids to the server for the Conversions API).
  window.readCookie = function (name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };

  if (!id) return;

  // Meta's standard Pixel loader: creates fbq(), then loads fbevents.js asynchronously.
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  fbq('init', id);
  fbq('track', 'PageView');

  // Standard events. eventId (optional) lets Meta match this browser event to the server copy and count it once.
  window.track = function (name, params, eventId) {
    if (eventId) fbq('track', name, params || {}, { eventID: eventId });
    else fbq('track', name, params || {});
  };
  // Our own named events (they show up under "Custom events" in Events Manager).
  window.trackCustom = function (name, params) { fbq('trackCustom', name, params || {}); };
})();
