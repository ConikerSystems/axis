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
    // advancing rifleman: helmet, body leaning forward, rifle across, striding legs
    infantry:
      '<ellipse cx="-1.5" cy="-8" rx="3.4" ry="2.5"/>' +
      '<path d="M-4.8 -6.2 h6.6 v1.4 h-6.6 z"/>' +                              // helmet brim
      '<path d="M-3.2 -5 C-3.2 -5 -1 -4.4 0.4 -3 L3.2 -0.2 5.8 1 5 2.7 1.9 1.3 ' +
      'C1.9 1.3 2.6 4 2.2 6 L3.4 9.2 1.4 9.8 -0.1 6.2 -1.2 9.6 -3.3 9.2 -2.2 5 ' +
      '-2.8 0 -4.4 -1.8 -3.9 -4 Z"/>' +                                        // torso, arm to rifle, legs
      '<rect x="1.6" y="-6.6" width="1.5" height="9.5" rx="0.5" transform="rotate(24 2 -6)"/>', // rifle
    // field howitzer: big wheel, long barrel up-right, trail
    artillery:
      '<circle cx="-4.5" cy="5.5" r="4.2"/><circle cx="-4.5" cy="5.5" r="1.6" fill="#000" opacity="0.28"/>' +
      '<path d="M-6.5 4 L9.5 -6.5 L11 -4 L-3 6.8 Z"/>' +                        // barrel
      '<path d="M-5.5 6 L-11 9.5 -10 10.8 -3.5 7 Z"/>' +                        // trail leg
      '<rect x="-2" y="1.5" width="5" height="3" rx="1"/>',                     // breech
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
    // ---- AIR (side profile) ----
    // single-engine fighter with prop, cockpit, tail
    fighter:
      '<path d="M-11 0.5 C-8 -0.4 -2 -1 3 -1 L9 -0.4 10.5 0.6 9 1.6 3 2 ' +
      'C-2 2 -8 1.4 -11 0.5 Z"/>' +                                            // fuselage
      '<path d="M-2 -0.6 L4 -9 6 -9 2 -0.2 Z"/><path d="M-2 0.6 L4 9 6 9 2 0.2 Z"/>' + // wings
      '<path d="M-10.5 -0.2 L-13 -4 -11.5 -4 -8 -0.6 Z"/>' +                    // tail fin
      '<rect x="9.4" y="-3.2" width="1.5" height="6.4" rx="0.7"/>' +           // prop
      '<circle cx="0" cy="0" r="1.7" fill="#000" opacity="0.28"/>',            // cockpit
    // heavy bomber: long fuselage, big wing, engines
    bomber:
      '<path d="M-11.5 0.3 C-8 -0.6 6 -1.2 10.5 -0.2 12 0.3 10.5 0.9 6 1.2 ' +
      'C-6 1.9 -8 1.2 -11.5 0.3 Z"/>' +                                        // fuselage
      '<path d="M-4 -0.8 L2 -9.5 4 -9.5 1 -0.4 Z"/><path d="M-4 0.8 L2 9.5 4 9.5 1 0.4 Z"/>' +
      '<rect x="-1.5" y="-9.2" width="2.4" height="2.2" rx="0.6"/><rect x="-1.5" y="7" width="2.4" height="2.2" rx="0.6"/>' + // engines
      '<path d="M-11 -0.3 L-13.2 -3.5 -11.8 -3.5 -8.5 -0.6 Z"/>',              // tail
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
