/* Detailed profile silhouettes of the actual Axis & Allies plastic pieces.
   Each entry is SVG inner markup drawn centered on (0,0), extent ~±11, to sit
   inside a ~34px chip. Shapes use currentColor so board.js can render them
   twice (a dark offset "shadow" layer + a light top layer) for a sculpted,
   3D-plastic relief. Naval pieces sit on a waterline. */
window.UNIT_ICONS = (function () {
  "use strict";
  const wave = '<path d="M-11.5 8.4 q2.7 -1.8 5.5 0 t5.5 0 t5.5 0 t5.5 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/>';
  return {
    // ---- LAND ----
    // standing soldier: domed helmet, solid body, legs apart, rifle slung diagonally
    infantry:
      '<path d="M-4.8 -6.9 a4.8 4.8 0 0 1 9.6 0 z"/>' +                        // helmet dome
      '<rect x="-5.6" y="-7.1" width="11.2" height="1.7" rx="0.85"/>' +        // helmet brim
      '<path d="M-3.8 -4.4 h7.6 l0.9 7.2 h-2.5 l1.5 8.4 h-3.2 l-1.5 -7 -1.5 7 ' +
      'h-3.2 l1.5 -8.4 h-2.5 z"/>' +                                           // torso + legs apart
      '<rect x="-0.95" y="-12" width="1.9" height="17" rx="0.9" transform="rotate(38)"/>', // rifle
    // cannon: big spoked wheel + long barrel at 45° — unmistakably artillery
    artillery:
      '<circle cx="-2.5" cy="4.8" r="5.6" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
      '<circle cx="-2.5" cy="4.8" r="1.8"/>' +
      '<path d="M-2.5 -0.8 v11.2 M-8.1 4.8 h11.2 M-6.4 0.9 l7.9 7.9 M-6.4 8.7 l7.9 -7.9" ' +
      'fill="none" stroke="currentColor" stroke-width="1.5"/>' +               // wheel spokes
      '<path d="M-3.5 2.8 L9.6 -7.6 L11.8 -4.9 L-0.9 5.2 Z"/>' +               // long barrel
      '<path d="M-2 6.6 L5.4 10.6 L6.8 8.4 L-0.4 4.9 Z"/>',                    // trail
    // side-profile tank: hull, sloped turret, long gun, road wheels + track
    tank:
      '<path d="M-10 3.5 h20 l-2 3.2 h-16 z"/>' +                              // track pan
      '<circle cx="-6.5" cy="6.4" r="1.9"/><circle cx="-1.7" cy="6.4" r="1.9"/>' +
      '<circle cx="3.1" cy="6.4" r="1.9"/><circle cx="7.6" cy="6.4" r="1.7"/>' + // road wheels
      '<path d="M-9.5 3.8 L9.5 3.8 8 0 -8 0 Z"/>' +                             // hull
      '<path d="M-6 0 L2.5 0 4.2 -4.2 -4 -4.2 Z"/>' +                          // turret
      '<rect x="2" y="-3.6" width="10" height="1.9" rx="0.7"/>',               // gun barrel
    // AA gun: quad barrels angled up on a mount
    aaa:
      '<path d="M-8 8 L8 8 6 4.5 -6 4.5 Z"/>' +                                // base
      '<rect x="-2.5" y="1" width="5" height="4" rx="1"/>' +                   // mount
      '<rect x="-0.5" y="-10" width="1.6" height="12" rx="0.6" transform="rotate(-18 0 -1)"/>' +
      '<rect x="1.6" y="-10" width="1.6" height="12" rx="0.6" transform="rotate(-18 2 -1)"/>',
    // factory: hall with saw-tooth roof + chimney
    factory:
      '<path d="M-10 8.5 L-10 -0.5 -4 3.5 -4 -0.5 2 3.5 2 -0.5 8 3.5 8 -6.5 11 -6.5 11 8.5 Z"/>' +
      '<rect x="-7.5" y="-9.5" width="2.6" height="4.5"/>' +
      '<circle cx="-6.2" cy="-10.5" r="1.6" opacity="0.5"/>',
    // ---- AIR (top view, nose up — instantly tells fighter from bomber) ----
    // fighter: small single-engine — slim body, elliptical wing, visible propeller
    fighter:
      '<ellipse cx="0" cy="0" rx="2.3" ry="9.6"/>' +                           // fuselage
      '<ellipse cx="0" cy="-1.2" rx="10.6" ry="3"/>' +                         // elliptical wings
      '<ellipse cx="0" cy="8.2" rx="4.8" ry="1.7"/>' +                         // tailplane
      '<circle cx="0" cy="-10.2" r="1.8"/>' +                                  // spinner
      '<rect x="-5" y="-11.4" width="10" height="1.4" rx="0.7"/>',             // prop blades
    // bomber: big four-engine — long fuselage, broad straight wing, 4 nacelles, wide tail
    bomber:
      '<ellipse cx="0" cy="0" rx="2.7" ry="11.2"/>' +                          // long fuselage
      '<path d="M-12 -3 h24 l-1.8 4 h-20.4 z"/>' +                             // broad wing
      '<rect x="-9" y="-4.4" width="2.7" height="5.6" rx="1.1"/>' +
      '<rect x="-4.6" y="-4.9" width="2.7" height="6.4" rx="1.1"/>' +
      '<rect x="1.9" y="-4.9" width="2.7" height="6.4" rx="1.1"/>' +
      '<rect x="6.3" y="-4.4" width="2.7" height="5.6" rx="1.1"/>' +           // 4 engines
      '<path d="M-5.4 8.8 h10.8 l-1.3 2.6 h-8.2 z"/>',                         // tailplane
    // ---- SEA (side profile on waterline) ----
    submarine: wave +
      '<path d="M-10.5 3 q0 3 10.5 3 q10.5 0 10.5 -3 q0 -2.2 -10.5 -2.2 q-10.5 0 -10.5 2.2 Z"/>' +
      '<path d="M-2.5 -3.8 h4.5 v4.2 h-4.5 z"/><rect x="0.2" y="-6.4" width="1.4" height="3"/>',
    transport: wave +
      '<path d="M-11 1.5 L11 1.5 8.5 6.6 -8.5 6.6 Z"/>' +                      // hull
      '<rect x="-7" y="-2.5" width="5.5" height="4"/><rect x="1" y="-4" width="6" height="5.5"/>' + // deck cargo
      '<rect x="-2.5" y="-5" width="1.4" height="3"/>',
    destroyer: wave +
      '<path d="M-11 2 L11 2 8.5 6.6 -8.5 6.6 Z"/>' +
      '<path d="M-3 -3.5 L1 -3.5 1.6 2 -3 2 Z"/><rect x="-1.5" y="-6.5" width="1.3" height="3.5"/>' +
      '<rect x="4" y="0" width="3.5" height="2" rx="0.6"/><rect x="-7.5" y="0" width="2.6" height="2" rx="0.6"/>',
    cruiser: wave +
      '<path d="M-11.5 2 L11.5 2 9 6.6 -9 6.6 Z"/>' +
      '<path d="M-4 -4 L2 -4 2.6 2 -4 2 Z"/><rect x="-2" y="-7.5" width="1.5" height="4"/>' +
      '<rect x="-8.5" y="-0.5" width="3" height="2.5" rx="0.6"/><rect x="5" y="-0.5" width="3.8" height="2.5" rx="0.6"/>',
    carrier: wave +
      '<path d="M-11.5 2 L11.5 2 9 6.2 -9 6.2 Z"/>' +
      '<rect x="-11" y="-1.8" width="22" height="2.8" rx="1"/>' +              // flight deck
      '<rect x="3.5" y="-5.5" width="3.6" height="4.2"/><rect x="4.6" y="-8.5" width="1.4" height="3"/>' +
      '<circle cx="-6" cy="-0.6" r="0.9" fill="#000" opacity="0.25"/><circle cx="0" cy="-0.6" r="0.9" fill="#000" opacity="0.25"/>',
    battleship: wave +
      '<path d="M-11.5 2 L11.5 2 9 6.6 -9 6.6 Z"/>' +
      '<path d="M-4.5 -4.2 L3.5 -4.2 4 2 -4.5 2 Z"/>' +                        // superstructure
      '<rect x="-1.5" y="-8.5" width="1.6" height="4.5"/>' +                   // mast
      '<path d="M-9.5 -1 L-5.5 -1 -5.5 1.2 -9.5 1.2 Z"/><rect x="-10.5" y="-2.6" width="3" height="1.7" rx="0.5" transform="rotate(-16 -9 -2)"/>' + // fwd turret+guns
      '<path d="M5 -1 L9 -1 9 1.2 5 1.2 Z"/><rect x="7" y="-2.6" width="3" height="1.7" rx="0.5" transform="rotate(16 8.5 -2)"/>',                    // aft turret+guns
  };
})();
// Super Bomber shares the bomber silhouette (a gold ring in board.js marks it).
window.UNIT_ICONS.superbomber = window.UNIT_ICONS.bomber;
