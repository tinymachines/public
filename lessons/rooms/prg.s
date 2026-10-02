;; A room at a time, the way The Legend of Zelda was measured doing it:
;; the picture stands still while the square walks about a room, and
;; when it walks out of a side the next room slides in at 4 pixels a
;; frame, 64 frames for the screen's 256 pixels, carrying the square
;; with it. The new room is drawn as it comes: one column every second
;; frame, each written one column ahead of the edge that is sliding in,
;; which is how Zelda was seen to do it in the log of its writes. The rooms are a grid 16
;; wide, numbered along its rows: a step left takes one off the room's
;; number and a step right adds one. This first cut goes left and right;
;; up and down stop at the edge.
;;
;; The two name tables sit side by side (vertical mirroring). The room
;; on the screen is in one, the next is drawn into the other in the
;; blank, and the slide is the scroll moving from one to the other.
;;
;; Memory: $00 the frame flag, $01 the pad, $02 the pad a frame ago,
;; $10/$11 x (fraction, pixel), $14/$15 y, $30 the room, $31 what is
;; happening (0 walking, 2 sliding), $32 which way (0 left, 1 right),
;; $34 the slide's
;; steps, $35 the name table on the screen, $36/$37 the scroll (pixel,
;; page), $38 a column waiting for the NMI, $39/$3A its address, $3B
;; the room being drawn, $40 to $5D the column.
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
    JSR slide
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
;; Out of the left or right side, the next room begins.
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
    BCC noup
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
    BCS nodown
    CLC
    LDA $14
    ADC #$55
    STA $14
    LDA $15
    ADC #$01
    STA $15
nodown:
    RTS
;; Leaving: A is the way (0 left, 1 right). The room's number changes
;; and the slide begins.
leave:
    STA $32
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
;; One column of a room, A = the column (0 to 31), for the room in $3B,
;; into $40 to $5D, with its address in name table 0 in $39/$3A. Trees
;; along the top and bottom two rows and down both sides, with a gap in
;; the middle of each side to walk out by; inside, a tree wherever the
;; room's number and the place agree on it, so each room is different.
prepcol:
    STA $05
    STA $3A
    LDA #$20
    STA $39
    LDX #$00
row:
    CPX #$02
    BCC tree
    CPX #$1C
    BCS tree
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
side:
    CPX #$0C
    BCC tree
    CPX #$12
    BCS tree
sand:
    LDA #$00
    JMP put
tree:
    LDA #$03
put:
    STA $40,X
    INX
    CPX #$1E
    BNE row
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
;; In the blank: the sprites, a waiting column, then the scroll.
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
    JSR putcol
    LDA #$00
    STA $38
nocol:
    LDA $37
    ORA #$80
    STA $2000
    LDA $36
    STA $2005
    LDA #$00
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
