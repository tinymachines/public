;; The tiles. 0 is empty, 2 the ground (colour 2 with mortar lines in
;; colour 3), 6 a figure's head and 7 its body (colour 2, with eyes and a
;; belt in colour 3), our own, eight pixels across. The build fills the
;; rest of the 8 KiB with empty tiles.
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$80,$80,$80,$FF,$08,$08,$08,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$24,$00,$00,$00,$00,$3C,$7E,$FF,$FF,$FF,$FF,$7E,$3C
    .byte $00,$00,$00,$00,$7E,$00,$00,$00,$18,$3C,$7E,$7E,$7E,$7E,$24,$66
