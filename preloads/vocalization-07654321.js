// name: Vocalization 07654321
// description: Descending from 7 with major triad anchor and 12-semitone arpeggio
setcpm(12)
$: n("[0,3,7]@3 ~ 0 7 6 5 4 3 2 1 0 ~ [0,3,7]@3 ~"
     .add("<0 1 2 3 2 1>"
          .add("<0 2 4 6 8 10 12 10 8 6 4 2>/6")))
  .scale("C2: Major")
  .sound("piano")
  .color("magenta")
  ._punchcard({labels:1})