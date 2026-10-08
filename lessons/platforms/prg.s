;; A moving platform. The ground has a hole three blocks wide, and over
;; it a lift three blocks long goes back and forth, a pixel a frame,
;; from one side of the hole to the other and back. Step onto it and it
;; carries the square: every frame the lift moves, the square standing
;; on it moves by the same, with nothing pressed. Walk off its end over
;; the hole and the square falls; through the bottom of the screen it is
;; put back at the start. Super Mario Bros. was seen doing the same with
;; its lifts: the lift is an object like an enemy, moved a step at a
;; time, and Mario standing on it is moved by the lift's own step on the
;; same frame. The lift's size, speed and path are ours.
;;
;; Positions and speeds are two bytes, a whole pixel and 256ths of one,
;; as in the jump lesson. Memory: $00 the frame flag the NMI sets, $01
;; the pad, $02 the pad a frame ago, $03 1 while in the air, $10/$11 x,
;; $12/$13 the speed across, $14/$15 y, $16/$17 the speed down, $20/$21
;; the point to look up (x, y), $22 the block there, $30 the lift's x,
;; $31 its step (1 right, $FF left), $32 1 while the square stands on
;; it, $33 the lift's top, $0400 to $04EF the level, a byte a block (0
;; air, 1 ground, 4 the wall).
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
;; The level into memory, where the square looks it up.
    LDX #$00
copy:
    LDA level,X
    STA $0400,X
    INX
    CPX #$F0
    BNE copy
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
    JSR begin
    LDA #$50
    STA $30
    LDA #$01
    STA $31
    LDA #$D0
    STA $33
    LDA #$80
    STA $2000
    LDA #$1E
    STA $2001
main:
    LDA $00
    BEQ main
    LDA #$00
    STA $00
    JSR lift
    JSR readpad
    JSR walk
    JSR jump
    JSR draw
    JMP main
solid:
    LDA $21
    AND #$F0
    STA $22
    LDA $20
    LSR A
    LSR A
    LSR A
    LSR A
    ORA $22
    STA $22
    TAX
    LDA $0400,X
    RTS
;; Across: Right adds 10/256 a frame up to 1.5 pixels a frame; without
;; it the speed falls by the same until it is 0. Then the right edge's
;; two corners are looked up: in a block, the square goes back to touch
;; it and its speed across is taken away.
;; The lift: a pixel a frame along its path, turning at either end (x
;; 80, where the hole begins, and x 128, where its far end meets the far
;; side). A square standing on it is moved the same pixel on the same
;; frame, before anything the pad asks for; and moved by the step the
;; lift just took, so the turn comes after the carry (turned first, the
;; square went one way while the lift went the other, once at each end).
lift:
    LDA $30
    CLC
    ADC $31
    STA $30
    LDA $32
    BEQ carried
    LDA $11
    CLC
    ADC $31
    STA $11
carried:
    LDA $30
    CMP #$50
    BEQ turn
    CMP #$80
    BNE moved
turn:
    LDA #$00
    SEC
    SBC $31
    STA $31
moved:
    RTS
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
    BNE fast
    LDA $12
    CMP #$80
    BCC move
fast:
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
    CLC
    ADC #$0F
    STA $20
    LDA $15
    STA $21
    JSR solid
    BNE wall
    LDA $15
    CLC
    ADC #$0F
    STA $21
    JSR solid
    BEQ walked
wall:
    LDA $20
    AND #$F0
    SEC
    SBC #$10
    STA $11
    LDA #$00
    STA $10
    STA $12
    STA $13
walked:
    RTS
;; Up and down, as in the solid lesson: on the ground a new press of A
;; starts a jump and nothing underfoot means a fall; in the air, rising,
;; a block above ends the jump, and falling, a block below is landed on.
;; A fall that reaches the bottom of the screen is the hole: the square
;; is out of sight, and the wait begins with the world still going.
;; Up and down, as in the solid lesson: on the ground a new press of A
;; starts a jump and nothing underfoot means a fall; in the air, rising,
;; a block above ends the jump, and falling, a block or the lift below
;; is landed on. Past the bottom of the screen the square is put back.
jump:
    LDA $03
    BNE air
    LDA $02
    EOR #$FF
    AND $01
    AND #$80
    BEQ under
    LDA #$00
    STA $16
    STA $32
    LDA #$FC
    STA $17
    LDA #$01
    STA $03
    JMP air
under:
    JSR feet
    BNE stood
    LDA #$00
    STA $32
    LDA #$01
    STA $03
stood:
    RTS
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
    BMI rising
    CMP #$04
    BCC falling
    LDA #$00
    STA $16
    LDA #$04
    STA $17
falling:
    LDA $15
    CMP #$F0
    BCC onscreen
    JSR begin
    RTS
onscreen:
    JSR feet
    BEQ flying
    LDA $21
    AND #$F0
    SEC
    SBC #$10
    STA $15
landed:
    LDA #$00
    STA $14
    STA $16
    STA $17
    STA $03
flying:
    RTS
rising:
    LDA $15
    STA $21
    LDA $11
    STA $20
    JSR solid
    BNE head
    LDA $11
    CLC
    ADC #$0F
    STA $20
    JSR solid
    BEQ flying
head:
    LDA $21
    AND #$F0
    CLC
    ADC #$10
    STA $15
    LDA #$00
    STA $14
    STA $16
    STA $17
    RTS
;; What is under the square, one pixel below it: the lift first (its top
;; within four pixels below the square's feet, and the two overlapping
;; across), then the ground under either bottom corner. On the lift the
;; square is set on its top and $32 says so. A in the end is not zero
;; when something is underfoot.
feet:
    LDA $15
    CLC
    ADC #$10
    SEC
    SBC $33
    CMP #$05
    BCS ground
    LDA $11
    CLC
    ADC #$0F
    CMP $30
    BCC ground
    LDA $30
    CLC
    ADC #$2F
    CMP $11
    BCC ground
    LDA $33
    SEC
    SBC #$10
    STA $15
    STA $21
    LDA #$01
    STA $32
    RTS
ground:
    LDA #$00
    STA $32
    LDA $15
    CLC
    ADC #$10
    STA $21
    LDA $11
    STA $20
    JSR solid
    BNE footed
    LDA $11
    CLC
    ADC #$0F
    STA $20
    JSR solid
footed:
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
;; The square: four sprites of tile 1, two by two, at the position, or
;; out of sight once it has fallen below the screen.
;; The square: four sprites of tile 1, two by two, at the position;
;; the lift: six sprites of tile 2 in a row, at its x and top.
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
    LDX #$00
    LDA $30
    STA $24
slab:
    LDA $33
    SEC
    SBC #$01
    STA $0210,X
    LDA #$02
    STA $0211,X
    LDA #$01
    STA $0212,X
    LDA $24
    STA $0213,X
    CLC
    ADC #$08
    STA $24
    INX
    INX
    INX
    INX
    CPX #$18
    BNE slab
    RTS
;; The level from its start, with the picture off: the level drawn (each
;; block two tiles across and two down, a row of blocks at a time, then
;; empty colours), the square at the left on the ground, and the scroll
;; at the corner.
begin:
    LDA #$00
    STA $2001
    LDA #$20
    STA $2006
    LDA #$00
    STA $2006
    LDY #$00
blockrow:
    LDA #$02
    STA $23
tilerow:
    TYA
    TAX
    LDA #$10
    STA $24
across:
    LDA $0400,X
    STX $25
    TAX
    LDA tileof,X
    STA $2007
    STA $2007
    LDX $25
    INX
    DEC $24
    BNE across
    DEC $23
    BNE tilerow
    TYA
    CLC
    ADC #$10
    TAY
    CPY #$F0
    BNE blockrow
    LDA #$00
    LDX #$40
paint:
    STA $2007
    DEX
    BNE paint
    LDA #$20
    STA $11
    LDA #$C0
    STA $15
    LDA #$00
    STA $10
    STA $12
    STA $13
    STA $14
    STA $16
    STA $17
    STA $03
    STA $32
    STA $2005
    STA $2005
    LDA #$1E
    STA $2001
    RTS
nmi:
    PHA
    LDA #$00
    STA $2003
    LDA #$02
    STA $4014
    LDA #$01
    STA $00
    PLA
    RTI
irq:
    RTI
;; The tile each kind of block is drawn with: air, ground, two kinds of
;; block not in this level, the wall.
tileof:
    .byte $00,$02,$03,$04,$05

;; The level, 16 blocks across and 15 down: two rows of ground with a
;; hole six blocks wide, columns 5 to 10, which the lift crosses.
level:
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $01,$01,$01,$01,$01,$00,$00,$00,$00,$00,$00,$01,$01,$01,$01,$01
    .byte $01,$01,$01,$01,$01,$00,$00,$00,$00,$00,$00,$01,$01,$01,$01,$01
colours:
    .byte $21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07
    .byte $21,$16,$27,$30,$21,$07,$27,$17,$21,$16,$27,$30,$21,$16,$27,$30
