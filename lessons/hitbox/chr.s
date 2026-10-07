;; The tiles. 0 is empty, 1 is the square (colour 1 throughout), 2 is the
;; ground (two colours, a brick's mortar lines in the lighter), 3 unused,
;; 4 the walker (colour 2, a rounded block), 5 to 7 unused, 8 a corner
;; mark (colour 3, an L in the top left of the tile; the other corners
;; are this tile turned over). The build fills the rest of the 8 KiB
;; with empty tiles.
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$80,$80,$80,$FF,$08,$08,$08,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$3C,$7E,$FF,$FF,$FF,$FF,$7E,$66
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $F0,$80,$80,$80,$00,$00,$00,$00,$F0,$80,$80,$80,$00,$00,$00,$00
