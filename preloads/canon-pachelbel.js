// name: Pachelbel Canon
// description: Melodic rendeirng of Pachelbel's canon
setcpm(30)

stack(
  // Ground bass
  note(`
    d2 a2 b2 f#2
    g2 d2 g2 a2
  `)
    .slow(4)
    .sound("gm_acoustic_bass")
    .gain(0.9)
    .color("cyan")
    ._punchcard(),

  // Sustained chord progression
  note(`
    [d3,f#3,a3]
    [a3,c#4,e4]
    [b3,d4,f#4]
    [f#3,a3,c#4]
    [g3,b3,d4]
    [d3,f#3,a3]
    [g3,b3,d4]
    [a3,c#4,e4]
  `)
    .slow(4)
    .sound("gm_string_ensemble_1")
    .attack(0.05)
    .release(1.8)
    .gain(0.55)
    .room(0.5)
    .color("pink")
    ._punchcard(),

  // Flowing broken-chord pattern
  note(`
    d4 f#4 a4 f#4
    a3 c#4 e4 c#4
    b3 d4 f#4 d4
    f#3 a3 c#4 a3
    g3 b3 d4 b3
    d4 f#4 a4 f#4
    g3 b3 d4 b3
    a3 c#4 e4 c#4
  `)
    .slow(4)
    .sound("gm_harpsichord")
    .gain(0.6)
    .room(0.25)
    .color("yellow")
    ._punchcard(),

  // Canon-inspired upper melody
  note(`
    f#5 e5 d5 c#5
    b4 a4 b4 c#5
    d5 c#5 b4 a4
    g4 f#4 g4 e4

    d4 f#4 a4 b4
    g4 f#4 d4 e4
    c#4 a4 a4 g4
    f#4 d4 f#4 e4
  `)
    .slow(4)
    .sound("gm_violin")
    .attack(0.03)
    .release(0.4)
    .gain(0.7)
    .room(0.4)
    .color("magenta")
    ._punchcard()
)
