;; A room at a time, the way The Legend of Zelda was measured doing it:
;; the picture stands still while the square walks about a room, and
;; when it walks out of a side the next room slides in at 4 pixels a
;; frame, 64 frames for the screen's 256 pixels, carrying the square
;; with it. The new room is drawn as it comes: one column every second
;; frame, each written one column ahead of the edge that is sliding in,
;; which is how Zelda was seen to do it in the log of its writes. The
;; rooms are a grid 16 wide, numbered along its rows: a step left takes
;; one off the room's number, a step right adds one, a step up takes 16
;; off and a step down adds 16.
;;
;; The two name tables sit side by side (vertical mirroring). Across,
;; the room on the screen is in one, the next is drawn into the other in
;; the blank, and the slide is the scroll moving from one to the other.
;; Up and down there is no second table to draw into, so the new room is
;; written over the old one in the same table, a row every second frame,
;; each row just before the scroll brings it into sight: 60 frames of 4
;; pixels for the screen's 240 lines. That is what Zelda was seen doing
;; for a step up: rows of 32 tiles across, from the bottom row up, one
;; every second frame, into the table on the screen. The row being
;; written is also, for those frames, the one leaving at the other edge,
;; so an 8-line band there shows the new room early; on most
;; televisions those lines are outside the picture.
;;
;; Memory: $00 the frame flag, $01 the pad, $02 the pad a frame ago,
;; $10/$11 x (fraction, pixel), $14/$15 y, $30 the room, $31 what is
;; happening (0 walking, 2 sliding across, 3 sliding up or down), $32
;; which way (0 left, 1 right, 2 up, 3 down), $34 the slide's steps, $35
;; the name table on the screen, $36/$37 the scroll across (pixel,
;; page), $3C the scroll down, $38 what waits for the NMI (1 a column, 2
;; a row), $39/$3A its address, $3B the room being drawn, $0D the row,
;; $40 to $5F the column or the row.
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
;; The first room, the one Zelda starts in, into name table 0, and its
;; colour choices (all the first palette).
    LDA #$77
    STA $30
    STA $3B
    LDA #$00
    STA $04
first:
    LDA $04
    JSR prepcol
    JSR putcol
    INC $04
    LDA $04
    CMP #$20
    BNE first
    LDA #$23
    STA $2006
    LDA #$C0
    STA $2006
    LDA #$00
    LDX #$40
attrs:
    STA $2007
    DEX
    BNE attrs
    LDA #$27
    STA $2006
    LDA #$C0
    STA $2006
    LDA #$00
    LDX #$40
attrs1:
    STA $2007
    DEX
    BNE attrs1
    LDA #$78
    STA $11
    LDA #$70
    STA $15
    LDA #$00
    STA $2005
    STA $2005
    LDA #$80
    STA $06
    STA $2000
    LDA #$1E
    STA $2001
main:
    LDA $00
    BEQ main
    LDA #$00
    STA $00
    JSR readpad
    LDA $31
    BEQ walking
    CMP #$03
    BEQ upright
    JSR slide
    JMP shown
upright:
    JSR rise
    JMP shown
walking:
    JSR walk
shown:
    JSR sprite
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
;; Walking: 1 and 85/256 pixels a frame in any of the four directions.
;; Out of a side, or out of the top or bottom through the gap in the
;; middle, the next room begins; elsewhere the top and bottom stop it.
walk:
    LDA $01
    AND #$02
    BEQ noleft
    SEC
    LDA $10
    SBC #$55
    STA $10
    LDA $11
    SBC #$01
    STA $11
    CMP #$02
    BCS noleft
    LDA #$00
    JMP leave
noleft:
    LDA $01
    AND #$01
    BEQ noright
    CLC
    LDA $10
    ADC #$55
    STA $10
    LDA $11
    ADC #$01
    STA $11
    CMP #$EE
    BCC noright
    LDA #$01
    JMP leave
noright:
    LDA $01
    AND #$08
    BEQ noup
    LDA $15
    CMP #$12
    BCS goup
    JSR ingap
    BCC noup
    LDA #$02
    JMP leave
goup:
    SEC
    LDA $14
    SBC #$55
    STA $14
    LDA $15
    SBC #$01
    STA $15
noup:
    LDA $01
    AND #$04
    BEQ nodown
    LDA $15
    CMP #$D0
    BCC godown
    JSR ingap
    BCC nodown
    LDA #$03
    JMP leave
godown:
    CLC
    LDA $14
    ADC #$55
    STA $14
    LDA $15
    ADC #$01
    STA $15
nodown:
    RTS
;; Whether the square is inside the gap in the top and bottom rows
;; (columns 14 to 17, x from 112 to 128): carry set if so.
ingap:
    LDA $11
    CMP #$70
    BCC outside
    CMP #$81
    BCS outside
    SEC
    RTS
outside:
    CLC
    RTS
;; Leaving: A is the way (0 left, 1 right, 2 up, 3 down). The room's
;; number changes and the slide begins.
leave:
    STA $32
    CMP #$02
    BCS vertical
    CMP #$00
    BEQ west
    INC $30
    JMP begun
west:
    DEC $30
begun:
    LDA $30
    STA $3B
    LDA #$00
    STA $34
    LDA #$02
    STA $31
    RTS
vertical:
    BNE south
    SEC
    LDA $30
    SBC #$10
    STA $30
    JMP risen
south:
    CLC
    LDA $30
    ADC #$10
    STA $30
risen:
    LDA $30
    STA $3B
    LDA #$00
    STA $34
    LDA #$03
    STA $31
    RTS
;; Sliding up or down: on every second step a row of the new room into
;; the table on the screen, the next to come into sight (from its bottom
;; row going up, from its top going down); then the scroll moves 4 lines,
;; the square goes with the picture, and after 60 steps the new room is
;; the whole screen.
rise:
    LDA $34
    AND #$01
    BNE moved
    LDA $34
    LSR A
    LDX $32
    CPX #$03
    BEQ fromtop
    STA $0D
    LDA #$1D
    SEC
    SBC $0D
fromtop:
    JSR preprow
    LDA #$02
    STA $38
moved:
    LDA $32
    CMP #$03
    BEQ southward
    SEC
    LDA $3C
    SBC #$04
    BCS upnow
    ADC #$F0
upnow:
    STA $3C
    LDA $15
    CMP #$CC
    BCS lifted
    CLC
    ADC #$04
    STA $15
    JMP lifted
southward:
    CLC
    LDA $3C
    ADC #$04
    CMP #$F0
    BCC downnow
    SBC #$F0
downnow:
    STA $3C
    LDA $15
    CMP #$14
    BCC lifted
    SEC
    SBC #$04
    STA $15
lifted:
    INC $34
    LDA $34
    CMP #$3C
    BNE rising
    LDA #$00
    STA $3C
    STA $31
rising:
    RTS
;; Sliding: on every second step a column of the new room, the next to
;; come into sight (from its right side going left, from its left going
;; right); then the scroll moves 4 pixels toward the new room, the square
;; goes with the picture, and after 64 steps the new room is the one on
;; the screen.
slide:
    LDA $34
    AND #$01
    BNE stepped
    LDA $34
    LSR A
    LDX $32
    BNE fromleft
    EOR #$1F
fromleft:
    JSR prepcol
    LDA $35
    EOR #$01
    ASL A
    ASL A
    ORA $39
    STA $39
    LDA #$01
    STA $38
stepped:
    LDA $32
    BNE east
    SEC
    LDA $36
    SBC #$04
    STA $36
    LDA $37
    SBC #$00
    AND #$01
    STA $37
    LDA $11
    CMP #$EC
    BCS carried
    CLC
    ADC #$04
    STA $11
    JMP carried
east:
    CLC
    LDA $36
    ADC #$04
    STA $36
    LDA $37
    ADC #$00
    AND #$01
    STA $37
    LDA $11
    CMP #$04
    BCC carried
    SEC
    SBC #$04
    STA $11
carried:
    INC $34
    LDA $34
    CMP #$40
    BNE sliding
    LDA $35
    EOR #$01
    STA $35
    STA $37
    LDA #$00
    STA $36
    STA $31
sliding:
    RTS
;; What tile is at a place in a room: the column in $05, the row in X,
;; the room in $3B; the tile comes back in A and X is kept. Trees along
;; the top and bottom two rows and down both sides, with a gap in the
;; middle of each to walk out by; inside, a tree wherever the room's
;; number and the place agree on it, so each room is different.
tileat:
    CPX #$02
    BCC edge
    CPX #$1C
    BCS edge
    LDA $05
    BEQ side
    CMP #$1F
    BEQ side
    CMP #$04
    BCC sand
    CMP #$1C
    BCS sand
    CPX #$04
    BCC sand
    CPX #$1A
    BCS sand
;; inside: col*7 + row*3 + room, a tree when its low five bits are 0
    LDA $05
    ASL A
    ASL A
    ASL A
    SEC
    SBC $05
    STA $07
    TXA
    ASL A
    STA $08
    TXA
    CLC
    ADC $08
    CLC
    ADC $07
    CLC
    ADC $3B
    AND #$1F
    BEQ tree
    JMP sand
edge:
    LDA $05
    CMP #$0E
    BCC tree
    CMP #$12
    BCS tree
    JMP sand
side:
    CPX #$0C
    BCC tree
    CPX #$12
    BCS tree
sand:
    LDA #$00
    RTS
tree:
    LDA #$03
    RTS
;; One column of the room in $3B, A = the column (0 to 31), into $40 to
;; $5D, with its address in name table 0 in $39/$3A.
prepcol:
    STA $05
    STA $3A
    LDA #$20
    STA $39
    LDX #$00
down30:
    JSR tileat
    STA $40,X
    INX
    CPX #$1E
    BNE down30
    RTS
;; One row of the room in $3B, A = the row (0 to 29), into $40 to $5F,
;; with its address in the name table on the screen in $39/$3A.
preprow:
    STA $0D
    LSR A
    LSR A
    LSR A
    STA $39
    LDA $35
    ASL A
    ASL A
    ORA #$20
    ORA $39
    STA $39
    LDA $0D
    ASL A
    ASL A
    ASL A
    ASL A
    ASL A
    STA $3A
    LDY #$00
across:
    STY $05
    LDX $0D
    JSR tileat
    STA $40,Y
    INY
    CPY #$20
    BNE across
    RTS
;; A row into the picture chip, going across.
putrow:
    LDA $39
    STA $2006
    LDA $3A
    STA $2006
    LDX #$00
along:
    LDA $40,X
    STA $2007
    INX
    CPX #$20
    BNE along
    RTS
;; A column into the picture chip, going down. $06 is what $2000 holds
;; otherwise, so an NMI cannot turn the step back to 1 halfway down.
putcol:
    LDA $06
    ORA #$04
    STA $2000
    LDA $39
    STA $2006
    LDA $3A
    STA $2006
    LDX #$00
down:
    LDA $40,X
    STA $2007
    INX
    CPX #$1E
    BNE down
    LDA $06
    STA $2000
    RTS
;; The square: four sprites of tile 1 at its place on the screen.
sprite:
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
;; In the blank: the sprites, a waiting column or row, then the scroll.
nmi:
    PHA
    TXA
    PHA
    LDA #$00
    STA $2003
    LDA #$02
    STA $4014
    LDA $38
    BEQ nocol
    CMP #$02
    BEQ arow
    JSR putcol
    JMP written
arow:
    JSR putrow
written:
    LDA #$00
    STA $38
nocol:
    LDA $37
    ORA #$80
    STA $2000
    LDA $36
    STA $2005
    LDA $3C
    STA $2005
    LDA #$01
    STA $00
    PLA
    TAX
    PLA
    RTI
irq:
    RTI
colours:
    .byte $27,$19,$29,$09,$27,$19,$29,$09,$27,$19,$29,$09,$27,$19,$29,$09
    .byte $27,$16,$27,$30,$27,$16,$27,$30,$27,$16,$27,$30,$27,$16,$27,$30
