;; The camera's dead zone. A level two screens wide, and a square that
;; walks left and right across it at a pixel and a half a frame. The
;; camera does not follow every step: inside a stretch of the screen,
;; the dead zone, the square walks and the picture stays still. Past 80
;; pixels from the left edge, walking right, the camera starts to move,
;; but only a pixel a frame, so the square still gains on it; at 112 the
;; camera takes every pixel and the square stays put on the screen.
;; Walking left, the camera waits until the square is 48 pixels from the
;; left edge and then keeps it there. Super Mario Bros. was seen doing the
;; same on its right: the camera starting near 80, easing in, and holding
;; Mario at 112. On its left it never moves at all, so Mario can walk back
;; to the screen's edge but never back into the level behind him. Ours
;; goes back; the numbers on the right are the game's.
;;
;; Memory: $00 the frame flag the NMI sets, $01 the pad, $02 the pad a
;; frame ago, $10/$11/$12 x (256ths, then the pixel as two bytes, 0 to
;; 496), $13 the pixels moved this frame (signed), $20/$21 the camera
;; (0 to 256), $22 the square's place on the screen, $23 a scratch byte.
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
;; The palette: sky, white, orange, brown.
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
;; Both screens, side by side (vertical mirroring), drawn once: sky,
;; four rows of ground at the bottom, and a post every 64 pixels so the
;; picture shows it moving.
    LDA #$20
    JSR screen
    LDA #$24
    JSR screen
    LDA #$20
    STA $11
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
    JSR move
    JSR camera
    JSR draw
    JMP main
;; One screen's name table, its high address byte in A: thirty rows of
;; thirty-two tiles, then its colours.
screen:
    STA $2006
    LDA #$00
    STA $2006
    LDY #$00
row:
    LDX #$00
col:
    LDA #$00
    CPY #$1A
    BCC notground
    LDA #$02
    JMP put
notground:
    CPY #$16
    BCC put
    TXA
    AND #$07
    BNE blank
    LDA #$05
    JMP put
blank:
    LDA #$00
put:
    STA $2007
    INX
    CPX #$20
    BNE col
    INY
    CPY #$1E
    BNE row
    LDA #$00
    LDX #$40
colours2:
    STA $2007
    DEX
    BNE colours2
    RTS
;; Across: Right moves a pixel and a half a frame, Left the same back,
;; between the level's two ends (0 and 496). $13 is how many whole
;; pixels that moved, negative to the left.
move:
    LDA $11
    STA $23
    LDA $01
    AND #$01
    BEQ notright
    CLC
    LDA $10
    ADC #$80
    STA $10
    LDA $11
    ADC #$01
    STA $11
    LDA $12
    ADC #$00
    STA $12
    BEQ moved
    LDA $11
    CMP #$F0
    BCC moved
    LDA #$F0
    STA $11
    LDA #$00
    STA $10
    JMP moved
notright:
    LDA $01
    AND #$02
    BEQ moved
    SEC
    LDA $10
    SBC #$80
    STA $10
    LDA $11
    SBC #$01
    STA $11
    LDA $12
    SBC #$00
    STA $12
    BPL moved
    LDA #$00
    STA $10
    STA $11
    STA $12
moved:
    LDA $11
    SEC
    SBC $23
    STA $13
    RTS
;; The camera, after the square has moved. Its place on the screen is x
;; less the camera. Walking right past 80, the camera moves a pixel; and
;; if the square is still past 112, the camera is set to keep it at 112.
;; Walking left with the square nearer the edge than 48, the camera is
;; set to keep it at 48. Then the camera is held between 0 and 256, the
;; two ends of the level.
camera:
    LDA $11
    SEC
    SBC $20
    STA $22
    LDA $13
    BEQ settled
    BMI leftward
    LDA $22
    CMP #$51
    BCC settled
    INC $20
    BNE eased
    INC $21
eased:
    LDA $11
    SEC
    SBC $20
    CMP #$71
    BCC hold
    LDA $11
    SEC
    SBC #$70
    STA $20
    LDA $12
    SBC #$00
    STA $21
    JMP hold
leftward:
    LDA $22
    CMP #$30
    BCS settled
    LDA $11
    SEC
    SBC #$30
    STA $20
    LDA $12
    SBC #$00
    STA $21
hold:
    LDA $21
    BPL notbelow
    LDA #$00
    STA $20
    STA $21
    JMP settled
notbelow:
    CMP #$01
    BCC settled
    BNE above
    LDA $20
    BEQ settled
above:
    LDA #$00
    STA $20
    LDA #$01
    STA $21
settled:
    LDA $11
    SEC
    SBC $20
    STA $22
    RTS
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
    RTS
;; The square: four sprites of tile 1, two by two, at its place on the
;; screen, standing on the ground.
draw:
    LDA #$BF
    STA $0200
    STA $0204
    LDA #$C7
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
    LDA $22
    STA $0203
    STA $020B
    CLC
    ADC #$08
    STA $0207
    STA $020F
    RTS
;; Each frame: the sprites copied in, and the picture told where the
;; camera is (its low byte as the scroll across, its high bit as which
;; screen it starts in).
nmi:
    PHA
    LDA #$00
    STA $2003
    LDA #$02
    STA $4014
    LDA $21
    AND #$01
    ORA #$80
    STA $2000
    LDA $20
    STA $2005
    LDA #$00
    STA $2005
    LDA #$01
    STA $00
    PLA
    RTI
irq:
    RTI
colours:
    .byte $21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
