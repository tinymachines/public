;; The level's end. The square walks to a pole at the right of the level
;; and touches it, and from there the game plays itself: the pad is
;; ignored, the square slides down the pole, walks on by itself to the
;; door, and stops; the time left counts down into the score, fifty
;; points a unit; the picture is put away for a card that names the
;; next level and the lives; and the next level begins. Super Mario
;; Bros. was seen ending a level this way: the slide down the flagpole,
;; the walk into the castle with the pad ignored, the time counted into
;; the score, the card with the next world's name, the next level. The
;; speeds, the rate of the count, the card's time and the words are
;; ours.
;;
;; Positions and speeds are two bytes, a whole pixel and 256ths of one,
;; as in the jump lesson. Memory: $00 the frame flag the NMI sets, $01
;; the pad, $02 the pad a frame ago, $03 1 while in the air, $10/$11 x,
;; $12/$13 the speed across, $14/$15 y, $16/$17 the speed down, $20/$21
;; the point to look up (x, y), $22 the block there, $50 the round (0
;; playing, 7 sliding, 8 walking by itself, 9 counting the time, 10
;; the card), $51 frames left of a wait, $52 the lives, $53 the level,
;; $54 frames until the time's next tick, $56 to $58 the time left
;; (hundreds, tens, ones), $60 to $63 the score (thousands to ones),
;; $0400 to $04EF the level, a byte a block (0 air, 1 ground, 4 the
;; wall, 5 the pole, 6 the door).
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
    LDA #$03
    STA $52
    LDA #$01
    STA $53
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
    JSR tick
    JSR pole
    JSR draw
    JMP main
over:
    CMP #$07
    BNE walking
;; Sliding: two pixels a frame down the pole to the ground, then the
;; walk begins.
    LDA $15
    CLC
    ADC #$02
    STA $15
    CMP #$C0
    BCC slid
    LDA #$C0
    STA $15
    LDA #$08
    STA $50
slid:
    JSR draw
    JMP main
walking:
    CMP #$08
    BNE counting
;; Walking by itself: one pixel a frame to the right, until the door.
    INC $11
    LDA $11
    CMP #$D0
    BCC walked2
    LDA #$09
    STA $50
walked2:
    JSR draw
    JMP main
counting:
    CMP #$09
    BNE card
;; Counting: a unit of time off and fifty points on, every frame, until
;; the time is gone; then the card.
    JSR tickdown
    JSR fifty
    JSR draw
    LDA $56
    ORA $57
    ORA $58
    BNE main
    INC $53
    JSR cardscreen
    JMP main
;; The card: its wait runs out, then the next level begins.
card:
    DEC $51
    BNE main
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
;; two corners are looked up: in a wall, the square goes back to touch
;; it and its speed across is taken away; the pole and the door are
;; walked into, and the pole is the level's end (see pole).
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
    CMP #$04
    BEQ wall
    LDA $15
    CLC
    ADC #$0F
    STA $21
    JSR solid
    CMP #$04
    BNE walked
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
    CMP #$01
    BEQ head
    LDA $11
    CLC
    ADC #$0F
    STA $20
    JSR solid
    CMP #$01
    BNE flying
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
;; The two bottom corners, one pixel under the square: the ground under
;; either, in A (the pole and the door are not stood on).
feet:
    LDA $15
    CLC
    ADC #$10
    STA $21
    LDA $11
    STA $20
    JSR solid
    CMP #$01
    BEQ footed
    LDA $11
    CLC
    ADC #$0F
    STA $20
    JSR solid
    CMP #$01
    BEQ footed
    LDA #$00
    RTS
footed:
    LDA #$01
    RTS
;; The time, while playing: a unit off every 24 frames.
tick:
    DEC $54
    BNE ticked
    LDA #$18
    STA $54
    JSR tickdown
ticked:
    RTS
;; One unit off the time left, in its three digits.
tickdown:
    LDA $56
    ORA $57
    ORA $58
    BEQ gone
    DEC $58
    BPL gone
    LDA #$09
    STA $58
    DEC $57
    BPL gone
    LDA #$09
    STA $57
    DEC $56
gone:
    RTS
;; Fifty points on the score: five on the tens, carried up the digits.
fifty:
    LDA $62
    CLC
    ADC #$05
    STA $62
    CMP #$0A
    BCC added
    SEC
    SBC #$0A
    STA $62
    INC $61
    LDA $61
    CMP #$0A
    BCC added
    LDA #$00
    STA $61
    INC $60
added:
    RTS
;; The pole: the square's right edge reaching the pole's column, at any
;; height, is the level's end. From here the pad is not read again until
;; the next level: the slide begins.
pole:
    LDA $11
    CLC
    ADC #$0F
    STA $20
    LDA $15
    CLC
    ADC #$08
    STA $21
    JSR solid
    CMP #$05
    BNE notyet
    LDA #$07
    STA $50
    LDA #$00
    STA $12
    STA $13
    STA $16
    STA $17
    STA $03
notyet:
    RTS
;; The card between levels, drawn with the picture off: both tables
;; empty, every sprite out of sight, LEVEL and the next level's number
;; above, LIVES and the count below; it stays 120 frames.
cardscreen:
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
    LDA #$8C
    STA $2006
    LDX #$00
word1:
    LDA levelword,X
    STA $2007
    INX
    CPX #$06
    BNE word1
    LDA $53
    CLC
    ADC #$2A
    STA $2007
    LDA #$22
    STA $2006
    LDA #$0C
    STA $2006
    LDX #$00
word2:
    LDA livesword,X
    STA $2007
    INX
    CPX #$06
    BNE word2
    LDA $52
    CLC
    ADC #$2A
    STA $2007
    LDA #$0A
    STA $50
    LDA #$78
    STA $51
    LDA #$00
    STA $2005
    STA $2005
    LDA #$1E
    STA $2001
    RTS
;; LEVEL and a space, LIVES and a space, in our letters.
levelword:
    .byte $1B,$14,$25,$14,$1B,$00
livesword:
    .byte $1B,$18,$25,$14,$22,$00
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
;; The square: four sprites of tile 1, two by two, at the position; then
;; the time and the score in the bar at the top, written as sprites so
;; the picture stays as drawn: TIME and three digits on the left, the
;; score's four digits on the right.
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
digits:
    LDA #$0F
    STA $0210,X
    LDA #$00
    STA $0212,X
    INX
    INX
    INX
    INX
    CPX #$1C
    BNE digits
    LDA $56
    CLC
    ADC #$2A
    STA $0211
    LDA $57
    CLC
    ADC #$2A
    STA $0215
    LDA $58
    CLC
    ADC #$2A
    STA $0219
    LDA #$20
    STA $0213
    LDA #$28
    STA $0217
    LDA #$30
    STA $021B
    LDA $60
    CLC
    ADC #$2A
    STA $021D
    LDA $61
    CLC
    ADC #$2A
    STA $0221
    LDA $62
    CLC
    ADC #$2A
    STA $0225
    LDA $63
    CLC
    ADC #$2A
    STA $0229
    LDA #$B0
    STA $021F
    LDA #$B8
    STA $0223
    LDA #$C0
    STA $0227
    LDA #$C8
    STA $022B
    RTS
;; The level from its start, with the picture off: the level drawn (each
;; block two tiles across and two down, a row of blocks at a time, then
;; empty colours), the square at the left, the time at 300, and the
;; scroll at the corner. The score stays from level to level.
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
    LDA #$20
    STA $11
    LDA #$C0
    STA $15
    LDA #$03
    STA $56
    LDA #$00
    STA $57
    STA $58
    LDA #$18
    STA $54
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
;; block not in this level, the wall, the pole, the door.
tileof:
    .byte $00,$02,$03,$04,$05,$08,$09

;; The level, 16 blocks across and 15 down: two rows of ground, the pole
;; at column 12 from row 3 to row 12, the door at column 14 on the
;; ground, two blocks tall.
level:
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$06,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$05,$00,$06,$00
    .byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
    .byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
colours:
    .byte $21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
