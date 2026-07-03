/* Silhouette unit icons matching the reference app's chip art. Each entry is
   SVG inner markup drawn centered on (0,0), sized to fit inside a ~34px chip
   (icon extent roughly ±11). Fill is currentColor so the chip sets the tint.
   Naval units sit on a waterline. Used by board.js (map stacks) and the battle
   modal. */
window.UNIT_ICONS = (function () {
  "use strict";
  const water = '<path d="M-12 8 q3 -2 6 0 t6 0 t6 0 t6 0" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.75"/>';
  return {
    // land
    infantry: '<circle cx="0" cy="-6.5" r="3.2"/>' +
      '<path d="M-5.5 9 C-5.5 -0.5 -3.2 -2.5 0 -2.5 C3.2 -2.5 5.5 -0.5 5.5 9 Z"/>',
    artillery: '<circle cx="-5.5" cy="5.5" r="2.6"/><circle cx="3.5" cy="6" r="2"/>' +
      '<path d="M-6.5 3.5 L9 -6.5 L10.5 -4 L-4.5 6 Z"/><rect x="-7" y="4.5" width="6" height="2"/>',
    tank: '<rect x="-9.5" y="0.5" width="19" height="5.5" rx="2.6"/>' +
      '<circle cx="-6.5" cy="7" r="1.7"/><circle cx="-1.5" cy="7" r="1.7"/>' +
      '<circle cx="3.5" cy="7" r="1.7"/><circle cx="7.5" cy="7" r="1.7"/>' +
      '<path d="M-6.5 -4.5 L2.5 -4.5 L4.5 0.5 L-6.5 0.5 Z"/><rect x="2" y="-3.5" width="10" height="2" rx="1"/>',
    aaa: '<rect x="-8" y="6" width="16" height="3" rx="1.2"/>' +
      '<rect x="-1.4" y="-9.5" width="2.8" height="15" rx="1" transform="rotate(28 0 -1)"/>' +
      '<circle cx="0" cy="5" r="2"/>',
    factory: '<path d="M-9 8 L-9 -1 L-3 3 L-3 -1 L3 3 L3 -1 L9 3 L9 -6 L11 -6 L11 8 Z"/>' +
      '<rect x="-6" y="-9" width="2.5" height="4"/>',
    // air (top view)
    fighter: '<path d="M0 -10.5 L1.8 -3 L11 1.5 L11 3.5 L1.8 2.5 L1.3 8 L4 10.5 L4 11.5 ' +
      'L-4 11.5 L-4 10.5 L-1.3 8 L-1.8 2.5 L-11 3.5 L-11 1.5 L-1.8 -3 Z"/>',
    bomber: '<path d="M0 -10 L1.7 -4 L4 -3.5 L4 -1.5 L1.9 -1 L2 6.5 L5 9 L5 10.5 L-5 10.5 ' +
      'L-5 9 L-2 6.5 L-1.9 -1 L-4 -1.5 L-4 -3.5 L-1.7 -4 Z"/>' +
      '<rect x="-11" y="0.5" width="22" height="2.6" rx="1.3"/>',
    // sea (side view on waterline)
    submarine: water + '<path d="M-10 2.5 q0 2.8 10 2.8 q10 0 10 -2.8 q0 -2 -10 -2 q-10 0 -10 2 Z"/>' +
      '<rect x="-2" y="-3.5" width="4.5" height="4.5" rx="1"/><rect x="0.5" y="-6" width="1.4" height="3"/>',
    transport: water + '<path d="M-11 1.5 L11 1.5 L8.5 6.5 L-8.5 6.5 Z"/>' +
      '<rect x="-7" y="-3.5" width="14" height="5" rx="1"/><rect x="-2" y="-6" width="1.4" height="3"/>',
    destroyer: water + '<path d="M-11 2 L11 2 L8.5 6.5 L-8.5 6.5 Z"/>' +
      '<rect x="-4" y="-2.5" width="5" height="4.5"/><rect x="-1.5" y="-6" width="1.3" height="4"/>' +
      '<rect x="4" y="-0.5" width="4" height="2.5"/>',
    cruiser: water + '<path d="M-11.5 2 L11.5 2 L9 6.5 L-9 6.5 Z"/>' +
      '<rect x="-5" y="-3.5" width="7" height="5.5"/><rect x="-2" y="-7" width="1.4" height="4"/>' +
      '<rect x="-8" y="-0.5" width="3" height="2.5"/><rect x="5" y="-0.5" width="3.5" height="2.5"/>',
    carrier: water + '<path d="M-11.5 2 L11.5 2 L9 6 L-9 6 Z"/>' +
      '<rect x="-11" y="-1.5" width="22" height="2.5" rx="1"/>' +
      '<rect x="4" y="-5" width="3.5" height="4"/><rect x="5" y="-8" width="1.3" height="3"/>',
    battleship: water + '<path d="M-11.5 2 L11.5 2 L9 6.5 L-9 6.5 Z"/>' +
      '<rect x="-4.5" y="-4" width="8" height="6"/><rect x="-1.5" y="-8" width="1.5" height="4"/>' +
      '<rect x="-9" y="-1" width="3.5" height="3" rx="0.5"/><rect x="5.5" y="-1" width="3.5" height="3" rx="0.5"/>' +
      '<rect x="-9.5" y="-2.5" width="2.5" height="1.6" transform="rotate(-18 -8 -2)"/>' +
      '<rect x="6.5" y="-2.5" width="2.5" height="1.6" transform="rotate(18 8 -2)"/>',
  };
})();
