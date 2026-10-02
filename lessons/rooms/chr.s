;; The tiles. 0 is empty, 1 is the square (colour 1 throughout), 2 is the
;; ground (two colours, a brick's mortar lines in the lighter), 3 is a
;; tree here (the darker colour, a lighter rim). The build
;; fills the rest of the 8 KiB with empty tiles.
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$80,$80,$80,$FF,$08,$08,$08,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $00,$7E,$7E,$7E,$7E,$7E,$7E,$00,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
