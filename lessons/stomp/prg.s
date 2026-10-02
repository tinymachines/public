;; The jump lesson's square, and something walking toward it. Touching
;; it is one of two things, as Super Mario Bros. was measured deciding:
;; coming down on it from above is a stomp (it is flattened for 25
;; frames and the square bounces up at the speed a jump starts with);
;; anything else is a hit (the square goes back to where it started).
;; The walker moves half a pixel a frame, as the game's did.
;; Positions and speeds are two bytes: a whole pixel and 256ths of one.
;; Each frame in the air moves by the speed first and pulls after: in
;; the other order every jump comes out three or four pixels lower than
;; Mario's.
;;
;; Memory: $00 the frame flag the NMI sets, $01 the pad, $02 the pad a
;; frame ago, $03 1 while in the air, $10/$11 x (fraction, pixel),
;; $12/$13 the speed across, $14/$15 y, $16/$17 the speed down, $60/$61
;; the walker's x (pixel, fraction), $62 its state (0 walking, 4
;; flattened), $63 how long it stays flat, $64 its y, $65 hits, $66
;; stomps.
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
    JSR touch
    JSR draw
    JMP main
;; The pad: eight reads, A first, so A ends in bit 7 and Right in bit 0.
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
;; right when it reaches the left edge. Flattened, it waits, then comes
;; back from the right.
walker:
    LDA $62
    BNE flat
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
flat:
    DEC $63
    BNE walked
    LDA #$00
    STA $62
    LDA #$F0
    STA $60
    RTS
;; Touching: the two 16-pixel squares overlap when they are less than
;; 14 pixels apart across and 16 down. Then, if the square is falling
;; and is the higher of the two, it is a stomp; otherwise a hit.
touch:
    LDA $62
    BNE apart
    SEC
    LDA $11
    SBC $60
    BPL across
    EOR #$FF
    CLC
    ADC #$01
across:
    CMP #$0E
    BCS apart
    SEC
    LDA $15
    SBC $64
    STA $04
    BPL down
    EOR #$FF
    CLC
    ADC #$01
down:
    CMP #$10
    BCS apart
    LDA $17
    BMI hit
    ORA $16
    BEQ hit
    LDA $04
    BPL hit
    LDA #$04
    STA $62
    LDA #$19
    STA $63
    LDA #$00
    STA $16
    LDA #$FC
    STA $17
    LDA #$01
    STA $03
    INC $66
apart:
    RTS
hit:
    LDA #$28
    STA $11
    LDA #$B0
    STA $15
    LDA #$00
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
;; The walker: tile 4 two by two, or flattened, tile 5 along the ground.
    LDA #$FF
    LDX #$00
gone:
    STA $0210,X
    INX
    CPX #$10
    BNE gone
    LDA $62
    BNE squashed
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
    JMP place
squashed:
    LDA $64
    CLC
    ADC #$07
    STA $0218
    STA $021C
    LDA #$05
    STA $0219
    STA $021D
place:
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
