;; The jump lesson's square, and B to run, with the numbers read off
;; Super Mario Bros.: walking tops out at 1.5 pixels a frame, running at
;; 2.5, reached faster (14/256 more a frame against 10). And the jump
;; depends on how fast the square was going: at walking speed or below
;; it starts at 4 pixels a frame up with pulls of 30/256 (A held, rising)
;; and 96/256; faster than walking (25/16 or more) it starts at 5 with
;; pulls of 40/256 and 144/256. The running jump goes higher, and comes
;; down sooner once A is let go.
;; Positions and speeds are two bytes: a whole pixel and 256ths of one.
;; Each frame in the air moves by the speed first and pulls after: in
;; the other order every jump comes out three or four pixels lower than
;; Mario's.
;;
;; Memory: $00 the frame flag the NMI sets, $01 the pad, $02 the pad a
;; frame ago, $03 1 while in the air, $10/$11 x (fraction, pixel),
;; $12/$13 the speed across, $14/$15 y, $16/$17 the speed down, $18 which
;; jump (0 light, 1 strong).
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
;; The jump looks at the speed before this frame's step across, which is
;; what Mario's runs agree with: at 24/16 the frame before, the light
;; jump; at 25/16, the strong one.
    JSR jump
    JSR walk
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
;; Across: Right adds 10/256 a frame up to 1.5 pixels a frame, or with
;; B held 14/256 up to 2.5; let go of B and a speed above walking falls
;; back to it; without Right the speed falls by 10/256 until it is 0.
walk:
    LDA $01
    AND #$01
    BEQ slow
    LDA $01
    AND #$40
    BNE running
    LDA $13
    CMP #$01
    BCC walkup
    BNE overwalk
    LDA $12
    CMP #$80
    BCC walkup
    BEQ move
overwalk:
    SEC
    LDA $12
    SBC #$0A
    STA $12
    LDA $13
    SBC #$00
    STA $13
    JMP move
walkup:
    CLC
    LDA $12
    ADC #$0A
    STA $12
    LDA $13
    ADC #$00
    STA $13
    CMP #$01
    BCC move
    LDA $12
    CMP #$80
    BCC move
    LDA #$80
    STA $12
    LDA #$01
    STA $13
    JMP move
running:
    CLC
    LDA $12
    ADC #$0E
    STA $12
    LDA $13
    ADC #$00
    STA $13
    CMP #$02
    BCC move
    LDA $12
    CMP #$80
    BCC move
    LDA #$80
    STA $12
    LDA #$02
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
;; How fast it was going chooses the jump: $18 is 0 for the light one,
;; 1 for the strong one (speed 25/16 or more).
    LDA #$00
    STA $18
    STA $16
    LDA $13
    CMP #$01
    BCC light
    BNE strong
    LDA $12
    CMP #$90
    BCC light
strong:
    INC $18
    LDA #$FB
    STA $17
    JMP leapt
light:
    LDA #$FC
    STA $17
leapt:
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
    LDY $18
    LDX released,Y
    LDA $01
    AND #$80
    BEQ pull
    LDA $17
    BPL pull
    LDX held,Y
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
held:
    .byte $1E,$28
released:
    .byte $60,$90
colours:
    .byte $21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
