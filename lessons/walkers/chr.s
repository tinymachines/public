;; The tiles. 0 is empty, 1 is the square (colour 1 throughout), 2 is the
;; ground (colour 2 with mortar lines in colour 3), 3 and 4 the solid
;; lesson's blocks (not used here), 5 the wall (colour 2 with seams in
;; colour 3), 6 the top left of a walker and 7 its bottom left (colour 2,
;; an eye and a foot in colour 3; the right half is the same tiles turned
;; over). The build fills the rest of the 8 KiB with empty tiles.
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$80,$80,$80,$FF,$08,$08,$08,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $FF,$81,$99,$A5,$85,$89,$81,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $00,$7E,$7E,$7E,$7E,$7E,$7E,$00,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $81,$81,$81,$FF,$18,$18,$18,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $00,$00,$00,$0C,$0C,$00,$00,$00,$03,$0F,$1F,$3F,$7F,$7F,$FF,$FF
    .byte $00,$00,$00,$00,$00,$00,$1E,$3E,$FF,$FF,$7F,$3F,$0F,$00,$1E,$3E
