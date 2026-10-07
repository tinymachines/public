;; A box inside the picture. The square and the walker are each drawn
;; sixteen pixels square, but what touches is smaller: a box kept in
;; memory every frame, four edges each, the way Super Mario Bros. keeps
;; one for Mario and one for every enemy. Mario's box was read off the
;; game: three pixels in from each side of his picture and four down
;; from its top, to its bottom; a Goomba's is a band across the middle
;; of its picture, six down from the top and four up from the bottom.
;; Ours are those numbers. Two pictures can overlap by a few pixels
;; before the boxes do, and only the boxes decide: a touch sends the
;; square back to where it started. Select shows the boxes, a corner at
;; each of their four corners.
;;
;; Positions and speeds are two bytes, a whole pixel and 256ths of one,
;; as in the jump lesson. Memory: $00 the frame flag the NMI sets, $01
;; the pad, $02 the pad a frame ago, $03 1 while in the air, $10/$11 x,
;; $12/$13 the speed across, $14/$15 y, $16/$17 the speed down, $60/$61
;; the walker's x (pixel, fraction), $64 its y, $65 touches, $67 frames
;; the pictures overlapped while the boxes did not, $68 1 while the
;; boxes are shown, $70 to $73 the square's box (left, top, right,
;; bottom; the right and bottom edges are one past the last pixel),
;; $74 to $77 the walker's.
reset:
    SEI
    CLD
    LDX #$FF
    TXS
    LDX #$00
    STX $2000
    STX $2001
    STX $4010
    LDA #$40
    STA $4017
wait1:
    BIT $2002
    BPL wait1
    LDA #$00
    TAX
clear:
    STA $00,X
    STA $0300,X
    STA $0400,X
    STA $0500,X
    STA $0600,X
    STA $0700,X
    INX
    BNE clear
    LDA #$FF
hide:
    STA $0200,X
    INX
    BNE hide
wait2:
    BIT $2002
    BPL wait2
;; The palette: sky, ground and the square.
    LDA #$3F
    STA $2006
    LDA #$00
    STA $2006
    LDX #$00
pal:
    LDA colours,X
    STA $2007
    INX
    CPX #$20
    BNE pal
;; Name table 0: sky, then six rows of ground from row 24.
    LDA #$20
    STA $2006
    LDA #$00
    STA $2006
    LDY #$04
    TAX
sky:
    STA $2007
    INX
    BNE sky
    DEY
    BNE sky
    LDA #$23
    STA $2006
    LDA #$00
    STA $2006
    LDA #$02
    LDX #$C0
ground:
    STA $2007
    DEX
    BNE ground
    LDA #$28
    STA $11
    LDA #$B0
    STA $15
    STA $64
    LDA #$D0
    STA $60
    LDA #$00
    STA $2005
    STA $2005
    LDA #$80
    STA $2000
    LDA #$1E
    STA $2001
main:
    LDA $00
    BEQ main
    LDA #$00
    STA $00
    JSR readpad
    JSR walk
    JSR jump
    JSR walker
    JSR boxes
    JSR touch
    JSR draw
    JMP main
;; The pad: eight reads, A first, so A ends in bit 7 and Right in bit 0.
;; A new press of Select turns the boxes on or off.
readpad:
    LDA $01
    STA $02
    LDA #$01
    STA $4016
    LDA #$00
    STA $4016
    LDX #$08
readbit:
    LDA $4016
    LSR A
    ROL $01
    DEX
    BNE readbit
    LDA $02
    EOR #$FF
    AND $01
    AND #$20
    BEQ read
    LDA $68
    EOR #$01
    STA $68
read:
    RTS
;; Across: Right adds 10/256 a frame up to 1.5 pixels a frame; without
;; it the speed falls by the same until it is 0.
walk:
    LDA $01
    AND #$01
    BEQ slow
    CLC
    LDA $12
    ADC #$0A
    STA $12
    LDA $13
    ADC #$00
    STA $13
    CMP #$01
    BCC move
    BNE top
    LDA $12
    CMP #$80
    BCC move
top:
    LDA #$80
    STA $12
    LDA #$01
    STA $13
    JMP move
slow:
    LDA $12
    ORA $13
    BEQ move
    SEC
    LDA $12
    SBC #$0A
    STA $12
    LDA $13
    SBC #$00
    STA $13
    BCS move
    LDA #$00
    STA $12
    STA $13
move:
    CLC
    LDA $10
    ADC $12
    STA $10
    LDA $11
    ADC $13
    STA $11
    RTS
;; Up and down: a new press of A on the ground starts a jump.
jump:
    LDA $03
    BNE air
    LDA $02
    EOR #$FF
    AND $01
    AND #$80
    BEQ done
    LDA #$00
    STA $16
    LDA #$FC
    STA $17
    LDA #$01
    STA $03
air:
    CLC
    LDA $14
    ADC $16
    STA $14
    LDA $15
    ADC $17
    STA $15
    LDX #$60
    LDA $01
    AND #$80
    BEQ pull
    LDA $17
    BPL pull
    LDX #$1E
pull:
    TXA
    CLC
    ADC $16
    STA $16
    LDA $17
    ADC #$00
    STA $17
    BMI fall
    CMP #$04
    BCC fall
    LDA #$00
    STA $16
    LDA #$04
    STA $17
fall:
    LDA $17
    BMI done
    LDA $15
    CMP #$B0
    BCC done
    LDA #$B0
    STA $15
    LDA #$00
    STA $14
    STA $16
    STA $17
    STA $03
done:
    RTS
;; The walker: half a pixel a frame to the left, round again from the
;; right when it reaches the left edge.
walker:
    SEC
    LDA $61
    SBC #$80
    STA $61
    LDA $60
    SBC #$00
    STA $60
    CMP #$08
    BCS walked
    LDA #$F0
    STA $60
walked:
    RTS
;; The boxes, from the positions, every frame: the square's is 3 in from
;; each side and 4 down from the top of its picture, to its bottom; the
;; walker's is 3 in from each side, 6 down from the top and 4 up from
;; the bottom. The right and bottom edges are one past the last pixel,
;; so two boxes touch when each left edge is before the other's right.
boxes:
    LDA $11
    CLC
    ADC #$03
    STA $70
    ADC #$0A
    STA $72
    LDA $15
    CLC
    ADC #$04
    STA $71
    ADC #$0C
    STA $73
    LDA $60
    CLC
    ADC #$03
    STA $74
    ADC #$0A
    STA $76
    LDA $64
    CLC
    ADC #$06
    STA $75
    ADC #$06
    STA $77
    RTS
;; Touching: the two boxes overlap when each one's left edge is before
;; the other's right, and each one's top is above the other's bottom.
;; Then the square goes back to where it started, the walker to the
;; right edge, and a touch is counted. When only the pictures overlap
;; (closer than 16 apart both ways) the frame is counted too, and
;; nothing else happens.
touch:
    LDA $70
    CMP $76
    BCS apart
    LDA $74
    CMP $72
    BCS apart
    LDA $71
    CMP $77
    BCS apart
    LDA $75
    CMP $73
    BCS apart
    JMP hit
apart:
    SEC
    LDA $11
    SBC $60
    BPL across
    EOR #$FF
    CLC
    ADC #$01
across:
    CMP #$10
    BCS clear2
    SEC
    LDA $15
    SBC $64
    BPL down
    EOR #$FF
    CLC
    ADC #$01
down:
    CMP #$10
    BCS clear2
    INC $67
clear2:
    RTS
hit:
    LDA #$28
    STA $11
    LDA #$B0
    STA $15
    LDA #$F0
    STA $60
    LDA #$00
    STA $61
    STA $10
    STA $12
    STA $13
    STA $14
    STA $16
    STA $17
    STA $03
    INC $65
    RTS
;; The square: four sprites of tile 1, two by two, at the position.
draw:
    LDA $15
    SEC
    SBC #$01
    STA $0200
    STA $0204
    CLC
    ADC #$08
    STA $0208
    STA $020C
    LDA #$01
    STA $0201
    STA $0205
    STA $0209
    STA $020D
    LDA #$00
    STA $0202
    STA $0206
    STA $020A
    STA $020E
    LDA $11
    STA $0203
    STA $020B
    CLC
    ADC #$08
    STA $0207
    STA $020F
;; The walker: tile 4 two by two.
    LDA $64
    SEC
    SBC #$01
    STA $0210
    STA $0214
    CLC
    ADC #$08
    STA $0218
    STA $021C
    LDA #$04
    STA $0211
    STA $0215
    STA $0219
    STA $021D
    LDA #$00
    STA $0212
    STA $0216
    STA $021A
    STA $021E
    LDA $60
    STA $0213
    STA $021B
    CLC
    ADC #$08
    STA $0217
    STA $021F
;; The boxes' corners, when shown: tile 8 is a corner mark in the top
;; left of its tile, so it marks a box's top left corner as it is and
;; its bottom right corner turned over both ways; two sprites a box,
;; the square's at $0220 and the walker's at $0228. Two rather than
;; four: with the pictures' own sprites, four corners each would put
;; twelve sprites on a line where the two meet, and the chip draws
;; eight. Hidden, the sprites sit below the screen.
    LDA $68
    BNE shown
    LDA #$FF
    LDX #$00
unshown:
    STA $0220,X
    INX
    CPX #$10
    BNE unshown
    RTS
shown:
    LDX #$00
    LDY #$00
corners:
    LDA #$08
    STA $0221,Y
    STA $0225,Y
    LDA $71,X
    SEC
    SBC #$01
    STA $0220,Y
    LDA $73,X
    SEC
    SBC #$09
    STA $0224,Y
    LDA $70,X
    STA $0223,Y
    LDA $72,X
    SEC
    SBC #$08
    STA $0227,Y
    LDA #$00
    STA $0222,Y
    LDA #$C0
    STA $0226,Y
    TYA
    CLC
    ADC #$08
    TAY
    TXA
    CLC
    ADC #$04
    TAX
    CPX #$08
    BNE corners
    RTS
nmi:
    PHA
    LDA #$00
    STA $2003
    LDA #$02
    STA $4014
    LDA #$00
    STA $2005
    STA $2005
    LDA #$01
    STA $00
    PLA
    RTI
irq:
    RTI
colours:
    .byte $21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
