setcpm(12)
$: n("[0,2,4]@2 ~ 0 1 2 3 4 3 2 1 0 ~ [0,2,4]@2 ~"
     .add("<0 1 2 3 2 1 0>"
          .add("<0 2 4 6 8 10 8 6 4 2 0>/7")))
  .scale("C2: Major")
  .sound("piano")
  .color("magenta")
  ._punchcard({labels:1})