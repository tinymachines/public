;; Solid things: ground to stand on, a block overhead to bump, and a
;; wall to stop at. Super Mario Bros. was seen doing it this way: a jump
;; that meets a block from below ends there, the speed upward gone on the
;; frame of the touch, and the fall starts from that height; the block's
;; tiles go blank as it is bumped and come back, bumped, some frames
;; later; a block's top is a floor like any other; and at a wall the
;; speed across is taken away while the position holds. Here the level
;; is one screen of blocks 16 pixels square, kept in memory, and the
;; square looks it up at its own edges: ahead of it as it walks, above it
;; as it rises and below it as it falls or walks off an edge.
;;
;; Positions and speeds are two bytes, a whole pixel and 256ths of one,
;; as in the jump lesson. Memory: $00 the frame flag the NMI sets, $01
;; the pad, $02 the pad a frame ago, $03 1 while in the air, $10/$11 x,
;; $12/$13 the speed across, $14/$15 y, $16/$17 the speed down, $20/$21
;; the point to look up (x, y), $22 the block there, $30 the bumped
;; block's tiles (0 nothing to do, 1 blank them, 2 waiting, 3 draw it
;; bumped), $31 frames still to wait, $32/$33 where its tiles are, $0400
;; to $04EF the level, a byte a block (0 air, 1 ground, 2 a block not yet
;; bumped, 3 a bumped block, 4 the wall).
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
;; The level into memory, where a bump can change it.
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
;; The level drawn once with the picture off: each block two tiles across
;; and two down, a row of blocks at a time, then empty colours.
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
;; The bumped block's tiles first, while the picture is not being drawn,
;; then the scroll put back, then the frame's work.
    JSR bumped
    LDA #$00
    STA $2005
    STA $2005
    LDA #$80
    STA $2000
    JSR readpad
    JSR walk
    JSR jump
    JSR draw
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
;; Up and down. On the ground, a new press of A starts a jump, and
;; nothing under either bottom corner means a fall. In the air the speed
;; moves the square first and pulls after, as in the jump lesson; then,
;; rising, the top corners are looked up (a block there ends the jump:
;; the square goes down to touch it, its speed up is gone, and a block
;; not yet bumped is bumped), and falling, the bottom corners (a block
;; there is landed on).
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
    PHA
    LDA $21
    AND #$F0
    CLC
    ADC #$10
    STA $15
    LDA #$00
    STA $14
    STA $16
    STA $17
    PLA
    CMP #$02
    BNE flying
    JMP bump
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
;; A block bumped from below: bumped in the level at once, and its tiles
;; blank now and drawn bumped 12 frames later. Its tiles' place: the
;; name table, 64 for each row of blocks and 2 for each column.
bump:
    LDX $22
    LDA #$03
    STA $0400,X
    TXA
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    CLC
    ADC #$20
    STA $32
    TXA
    AND #$30
    ASL A
    ASL A
    STA $33
    TXA
    AND #$0F
    ASL A
    ORA $33
    STA $33
    LDA #$01
    STA $30
    LDA #$0C
    STA $31
    RTS
;; The bumped block's tiles, as far as they have got.
bumped:
    LDA $30
    BEQ done
    CMP #$02
    BNE now
    DEC $31
    BNE done
    LDA #$03
    STA $30
    RTS
now:
    LDX #$00
    CMP #$01
    BEQ four
    LDX #$04
four:
    LDA $32
    STA $2006
    LDA $33
    STA $2006
    STX $2007
    STX $2007
    LDA $32
    STA $2006
    LDA $33
    CLC
    ADC #$20
    STA $2006
    STX $2007
    STX $2007
    LDA $30
    CMP #$01
    BNE finished
    LDA #$02
    STA $30
    RTS
finished:
    LDA #$00
    STA $30
done:
    RTS
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
;; The tile each kind of block is drawn with: air, ground, a block not
;; yet bumped, a bumped block, the wall.
tileof:
    .byte $00,$02,$03,$04,$05
;; The level, 16 blocks across and 15 down: a block to bump on row 9, a
;; wall two blocks high at column 12, and two rows of ground.
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
    .byte $00,$00,$00,$00,$00,$00,$02,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$04,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$04,$00,$00,$00
    .byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
    .byte $01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01,$01
colours:
    .byte $21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
