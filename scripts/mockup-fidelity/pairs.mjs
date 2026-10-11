/**
 * Every phone screen with its approved mockup (design/mobile-mockups) and the app route
 * that should match it. `guest: true` loads the guest box fixture (a draft box for Sam),
 * `click` taps a button by its accessible name after load, `scroll` scrolls the app's
 * page scroller to the first element whose text matches.
 */
export const PAIRS = [
  { id: 'home-new', mockup: 'home.html', app: '/' },
  { id: 'home-draft', mockup: 'home.html?state=draft', app: '/', guest: true },
  { id: 'menu-draft', mockup: 'home.html?state=draft&menu=1', app: '/', guest: true, click: 'Open menu', firstOnly: true },
  { id: 'category', mockup: 'store.html?s=1', app: '/store/stuffies', guest: true },
  { id: 'collection', mockup: 'store.html?s=2', app: '/store/collection', guest: true },
  { id: 'pdp-add', mockup: 'store.html?s=3', app: '/product/lego-menorah', guest: true },
  { id: 'pdp-inbox', mockup: 'store.html?s=7', app: '/product/draw-your-own-dreidel', guest: true },
  { id: 'pdp-nobox', mockup: 'store.html?s=8', app: '/product/lego-menorah' },
  { id: 'cart', mockup: 'store.html?s=9', app: '/cart' },
  { id: 'onboarding-family', mockup: 'onboarding-v3.html?s=1', app: '/', click: 'Build my box', firstOnly: true },
  { id: 'box', mockup: 'box-v3.html', app: '/box', guest: true },
  { id: 'checkout', mockup: 'checkout.html', app: '/checkout', guest: true },
  { id: 'gift-landing', mockup: 'gift.html?s=1', app: '/gift' },
  { id: 'gift-type', mockup: 'gift.html?s=2', app: '/gift/give' },
  { id: 'candles', mockup: 'content.html?s=2&n=1', app: '/how-to/light-candles' },
  { id: 'dreidel', mockup: 'content.html?s=3', app: '/how-to/play-dreidel' },
  { id: 'login', mockup: 'auth.html?s=1', app: '/login' },
];
