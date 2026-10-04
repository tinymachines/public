;; Losing a life. Touch a walker and the round ends: everything holds
;; still while the square hangs where it was touched, then it hops up and
;; falls off the bottom of the screen; a life is taken, the picture is put
;; away for a screen that says how many are left, and the level begins
;; again from its start. With none left the screen says GAME OVER, and
;; then there are three again. Super Mario Bros. was seen losing a life
;; this way: a hang of a few frames at the touch, the hop and the fall
;; off the screen, the life taken as the fall ends, the picture cleared
;; for the screen with the lives left, and the level from its beginning.
;; The hang, the screen's time and the words are ours.
;;
;; Positions and speeds are two bytes, a whole pixel and 256ths of one,
;; as in the jump lesson. Memory: $00 the frame flag the NMI sets, $01
;; the pad, $02 the pad a frame ago, $03 1 while in the air, $10/$11 x,
;; $12/$13 the speed across, $14/$15 y, $16/$17 the speed down, $20/$21
;; the point to look up (x, y), $22 the block there, $40/$41 the walkers'
;; x, $42/$43 their steps (1 to the right, $FF to the left), $44 1 on the
;; frames the walkers move, $50 the round (0 playing, 1 hanging, 2
;; falling, 3 the lives screen, 4 the game over screen), $51 frames left
;; of a wait, $52 the lives, $0400 to $04EF the level, a byte a block (0
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
;; The level into memory, where the square and the walkers look it up.
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
    LDA #$03
    STA $52
    JSR begin
    LDA #$80
    STA $2000
    LDA #$1E
    STA $2001
main:
    LDA $00
    BEQ main
    LDA #$00
    STA $00
;; The frame's work, by where the round is.
    LDA $50
    BNE over
    JSR readpad
    JSR walk
    JSR jump
    JSR walkers
    JSR touch
    JSR draw
    JMP main
over:
    CMP #$01
    BNE notheld
;; Hanging: nothing moves for 20 frames.
    DEC $51
    BNE main
    LDA #$02
    STA $50
    JMP main
notheld:
    CMP #$02
    BNE screen
    JSR drop
;; Drawn only while still falling: the fall that ends brings up the screen,
;; which has put every sprite out of sight.
    LDA $50
    CMP #$02
    BNE main
    JSR draw
    JMP main
;; A screen: its wait runs out, then the round begins again, or after
;; GAME OVER, with three lives.
screen:
    DEC $51
    BNE main
    LDA $50
    CMP #$04
    BNE again
    LDA #$03
    STA $52
again:
    LDA #$00
    STA $2001
    JSR begin
    LDA #$1E
    STA $2001
    JMP main
;; The block at the point ($20, $21): its place in the level, the row from
;; the high half of y and the column from the high half of x, in $22, and
;; the block itself in A (0, and the zero flag, for air).
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
    LDA #$FC
    STA $17
    LDA #$01
    STA $03
    JMP air
under:
    JSR feet
    BNE stood
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
    JSR feet
    BEQ flying
    LDA $21
    AND #$F0
    SEC
    SBC #$10
    STA $15
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
;; The two bottom corners, one pixel under the square: the block under
;; either, in A.
feet:
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
;; The walkers, on every second frame: each takes its step, and if its
;; leading edge is then in a wall it goes back and turns. Then, if the one
;; on the left walks right and the one on the right walks left and they
;; touch (16 apart), both turn.
walkers:
    LDA $44
    EOR #$01
    STA $44
    BEQ resting
    LDX #$00
    JSR stride
    LDX #$01
    JSR stride
    LDA $42
    CMP #$01
    BNE resting
    LDA $43
    CMP #$FF
    BNE resting
    SEC
    LDA $41
    SBC $40
    CMP #$11
    BCS resting
    LDA #$FF
    STA $42
    LDA #$01
    STA $43
resting:
    RTS
;; Walker X: a step, and the block at its leading edge (its right edge
;; walking right, its left walking left), at its feet's height less one.
stride:
    CLC
    LDA $40,X
    ADC $42,X
    STA $40,X
    LDY $42,X
    CPY #$01
    BNE leftward
    CLC
    ADC #$0F
leftward:
    STA $20
    LDA #$CF
    STA $21
    STX $26
    JSR solid
    LDX $26
    CMP #$00
    BEQ strode
    SEC
    LDA $40,X
    SBC $42,X
    STA $40,X
    LDA #$00
    SEC
    SBC $42,X
    STA $42,X
strode:
    RTS
;; The square and each walker: closer than 14 pixels across and 14 up
;; and down (the walkers stand on the ground, their top at 192) is a touch,
;; and the round stops there: the square hangs for 20 frames with the hop
;; already in it, 4 pixels a frame upward.
touch:
    LDX #$01
near:
    LDA $11
    SEC
    SBC $40,X
    BCS across1
    EOR #$FF
    ADC #$01
across1:
    CMP #$0E
    BCS apart
    LDA $15
    SEC
    SBC #$C0
    BCS down1
    EOR #$FF
    ADC #$01
down1:
    CMP #$0E
    BCS apart
    LDA #$01
    STA $50
    LDA #$14
    STA $51
    LDA #$00
    STA $16
    LDA #$FC
    STA $17
    RTS
apart:
    DEX
    BPL near
    RTS
;; The fall: the speed moves the square and pulls 96/256 a frame, up to 4
;; pixels a frame, through anything. Past the bottom of the screen a life
;; is taken and the screen for what is left comes up.
drop:
    CLC
    LDA $14
    ADC $16
    STA $14
    LDA $15
    ADC $17
    STA $15
    CLC
    LDA $16
    ADC #$60
    STA $16
    LDA $17
    ADC #$00
    STA $17
    BMI dropping
    CMP #$04
    BCC low
    LDA #$00
    STA $16
    LDA #$04
    STA $17
low:
    LDA $15
    CMP #$F0
    BCC dropping
    DEC $52
    JSR lives
dropping:
    RTS
;; The screen between rounds, drawn with the picture off: both tables
;; empty, every sprite out of sight, and a line of words in the middle,
;; LIVES and the count, or GAME OVER with none left; it stays 120 frames.
lives:
    LDA #$00
    STA $2001
    LDA #$20
    STA $2006
    LDA #$00
    STA $2006
    TAX
    LDY #$04
wipe2:
    STA $2007
    INX
    BNE wipe2
    DEY
    BNE wipe2
    LDA #$FF
hide2:
    STA $0200,X
    INX
    BNE hide2
    LDA #$21
    STA $2006
    LDA #$CC
    STA $2006
    LDA $52
    BEQ gameover
    LDX #$00
word1:
    LDA livesword,X
    STA $2007
    INX
    CPX #$06
    BNE word1
    LDA $52
    CLC
    ADC #$2A
    STA $2007
    LDA #$03
    STA $50
    JMP shown
gameover:
    LDX #$00
word2:
    LDA overword,X
    STA $2007
    INX
    CPX #$09
    BNE word2
    LDA #$04
    STA $50
shown:
    LDA #$78
    STA $51
    LDA #$00
    STA $2005
    STA $2005
    LDA #$1E
    STA $2001
    RTS
;; LIVES and a space, then GAME OVER, in our letters.
livesword:
    .byte $1B,$18,$25,$14,$22,$00
overword:
    .byte $16,$10,$1C,$14,$00,$1E,$25,$14,$21
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
;; The walkers: four sprites each, the left half's tiles and the same
;; turned over on the right, standing on the ground.
    LDX #$00
    LDY #$10
pair:
    LDA #$BF
    STA $0200,Y
    STA $0204,Y
    LDA #$C7
    STA $0208,Y
    STA $020C,Y
    LDA #$06
    STA $0201,Y
    STA $0205,Y
    LDA #$07
    STA $0209,Y
    STA $020D,Y
    LDA #$00
    STA $0202,Y
    STA $020A,Y
    LDA #$40
    STA $0206,Y
    STA $020E,Y
    LDA $40,X
    STA $0203,Y
    STA $020B,Y
    CLC
    ADC #$08
    STA $0207,Y
    STA $020F,Y
    TYA
    CLC
    ADC #$10
    TAY
    INX
    CPX #$02
    BNE pair
    RTS
;; The round from its start, with the picture off: the level drawn (each
;; block two tiles across and two down, a row of blocks at a time, then
;; empty colours), the square and the walkers where they begin, and the
;; scroll at the corner.
begin:
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
    LDA #$40
    STA $11
    LDA #$C0
    STA $15
    LDA #$50
    STA $40
    LDA #$A8
    STA $41
    LDA #$01
    STA $42
    LDA #$FF
    STA $43
    LDA #$00
    STA $10
    STA $12
    STA $13
    STA $14
    STA $16
    STA $17
    STA $03
    STA $50
    STA $2005
    STA $2005
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

;; The level, 16 blocks across and 15 down: walls two blocks high at
;; columns 2 and 13, and two rows of ground.
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
    .byte $00,$00,$04,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$04,$00,$00
    .byte $00,$00,$04,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$04,$00,$00
    .byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
    .byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
colours:
    .byte $21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
