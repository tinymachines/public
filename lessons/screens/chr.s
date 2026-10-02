;; The tiles. Our own letters from 4 on, five pixels wide: A D E P R S T U.
;; 0 is empty, 1 is the square (colour 1 throughout), 2 is the
;; ground (two colours, a brick's mortar lines in the lighter), 3 is a
;; block (the darker colour, a lighter rim). The build
;; fills the rest of the 8 KiB with empty tiles.
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $FF,$80,$80,$80,$FF,$08,$08,$08,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $00,$7E,$7E,$7E,$7E,$7E,$7E,$00,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
    .byte $70,$88,$88,$F8,$88,$88,$88,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $F0,$88,$88,$88,$88,$88,$F0,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $F8,$80,$80,$F0,$80,$80,$F8,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $F0,$88,$88,$F0,$80,$80,$80,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $F0,$88,$88,$F0,$A0,$90,$88,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $78,$80,$80,$70,$08,$08,$F0,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $F8,$20,$20,$20,$20,$20,$20,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $88,$88,$88,$88,$88,$88,$70,$00,$00,$00,$00,$00,$00,$00,$00,$00
