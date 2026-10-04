;; The tiles. 0 is empty, 1 is the square (colour 1 throughout), 2 is the
;; ground (colour 2 with mortar lines in colour 3), 3 the block not yet
;; bumped (colour 2 with a rim and a mark in colour 3), 4 the block once
;; bumped (colour 3 with a rim in colour 2), 5 the wall (colour 2 with
;; seams in colour 3). The build fills the rest of the 8 KiB with empty
;; tiles.
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$80,$80,$80,$FF,$08,$08,$08,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $FF,$81,$99,$A5,$85,$89,$81,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $00,$7E,$7E,$7E,$7E,$7E,$7E,$00,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $81,$81,$81,$FF,$18,$18,$18,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
