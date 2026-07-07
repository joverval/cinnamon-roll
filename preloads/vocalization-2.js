setcpm(10)
$: n("[1,3,5]@3 ~ 1 2 1 3 1 5 4 3 2 1 ~ [1,3,5]@3 ~"
     .add("<1 2 3 4 3 2 1>"
          .add("<0 1 3 5 7 9 11 9 7 5 3 1>/7")))
  .scale("C2: Major")
  .sound("piano")
  .color("magenta")
  ._punchcard({labels:1})