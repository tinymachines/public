;; An item screen that the picture slides away to show. The Legend of
;; Zelda was seen doing it this way: Start does not cover the room with a
;; box; the whole picture, room and bar together, slides down a few
;; pixels a frame, and the item screen comes into view above it. The item
;; screen is in the other name table, the one stacked below this one, and
;; it is drawn there one row at a time, from the bottom up, just ahead of
;; the slide, so nothing is drawn that is not about to be seen. Nothing
;; splits the picture while it slides, and the board's mirroring stays
;; as it is. Start again slides it all back and draws nothing. Here the
;; slide is 4 pixels a frame for 44 frames, the item screen is our own
;; (a box, a word and three things of our own), and the room is a floor
;; ringed with trees under a bar.
;;
;; Memory: $00 the frame flag the NMI sets, $01 the pad, $02 the pad a
;; frame ago, $10/$11 x (fraction, pixel), $12/$13 the speed across, $40
;; the stage (0 playing, 1 opening, 2 open, 3 closing), $41 the scroll
;; down, $42 which name table is at the top (0 the room's, 2 the item
;; screen's), $43 the last row of the item screen drawn, $0300 to $031F
;; the row being drawn.
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
;; The palette: black, white, sand, green.
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
;; The item screen's name table empty, picture off: 1024 tiles and colours.
    LDA #$28
    STA $2006
    LDA #$00
    STA $2006
    LDY #$04
    TAX
wipe:
    STA $2007
    INX
    BNE wipe
    DEY
    BNE wipe
;; The room's name table: the bar (seven empty rows and a line), then 22
;; rows of floor ringed with trees, then empty colours.
    LDA #$20
    STA $2006
    LDA #$00
    STA $2006
    LDX #$E0
    LDA #$00
bar:
    STA $2007
    DEX
    BNE bar
    LDA #$04
    LDX #$20
line:
    STA $2007
    DEX
    BNE line
    LDY #$00
rows:
    LDX #$00
cols:
    LDA #$03
    CPY #$00
    BEQ tile
    CPY #$15
    BEQ tile
    CPX #$00
    BEQ tile
    CPX #$1F
    BEQ tile
    LDA #$02
tile:
    STA $2007
    INX
    CPX #$20
    BNE cols
    INY
    CPY #$16
    BNE rows
    LDA #$00
    LDX #$40
paint:
    STA $2007
    DEX
    BNE paint
    LDA #$28
    STA $11
    LDA #$1E
    STA $43
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
;; Writes to the picture first, while it is not being drawn, then the
;; scroll, then the frame's work.
    JSR picture
    JSR scroll
    JSR readpad
    JSR stage
    JSR draw
    JMP main
;; While opening, the item screen's row that the slide is about to show,
;; if it is not there yet.
picture:
    LDA $40
    CMP #$01
    BNE nodraw
    LDA $41
    LSR A
    LSR A
    LSR A
    CMP $43
    BEQ nodraw
    STA $43
    JSR itemrow
nodraw:
    RTS
;; Row $43 of the item screen, built in $0300 and written across: the
;; box's edge on rows 10 and 27, its sides between them, the word ITEMS
;; on row 12 and the three things on row 18.
itemrow:
    LDA #$00
    LDX #$1F
empty:
    STA $0300,X
    DEX
    BPL empty
    LDA $43
    CMP #$0A
    BEQ edge
    CMP #$1B
    BEQ edge
    BCS built
    CMP #$0A
    BCC built
    LDA #$05
    STA $0304
    STA $031B
    LDA $43
    CMP #$0C
    BNE things
    LDX #$04
word:
    LDA letters,X
    STA $030D,X
    DEX
    BPL word
things:
    LDA $43
    CMP #$12
    BNE built
    LDA #$0B
    STA $030A
    LDA #$0C
    STA $030F
    LDA #$0D
    STA $0314
    JMP built
edge:
    LDA #$05
    LDX #$17
top:
    STA $0304,X
    DEX
    BPL top
built:
    LDA #$80
    STA $2000
    LDA $43
    LSR A
    LSR A
    LSR A
    ORA #$28
    STA $2006
    LDA $43
    ASL A
    ASL A
    ASL A
    ASL A
    ASL A
    STA $2006
    LDX #$00
copy:
    LDA $0300,X
    STA $2007
    INX
    CPX #$20
    BNE copy
    RTS
;; ITEMS, in our letters.
letters:
    .byte $06,$07,$08,$09,$0A
;; The scroll for the frame: which table is at the top, and how far down.
scroll:
    LDA $42
    ORA #$80
    STA $2000
    LDA #$00
    STA $2005
    LDA $41
    STA $2005
    RTS
;; Playing, Start begins the slide; open, Start begins the slide back.
;; While either slide runs Start is not read. Opening: the scroll starts
;; 4 pixels above the bottom of the item screen's table and moves up it 4
;; pixels a frame until 64 pixels down, where the room's bar shows below
;; the item screen. Closing goes back the same way to the room's own
;; table. (A scroll of 240 or more down would show the colours as tiles,
;; so neither slide ever stops there.)
stage:
    LDA $02
    EOR #$FF
    AND $01
    AND #$10
    TAX
    LDA $40
    BNE notplay
    TXA
    BEQ play
    LDA #$01
    STA $40
    LDA #$02
    STA $42
    LDA #$EC
    STA $41
    LDA #$1E
    STA $43
play:
    JMP walk
notplay:
    CMP #$01
    BNE notopen
    SEC
    LDA $41
    SBC #$04
    STA $41
    CMP #$40
    BNE slid
    LDA #$02
    STA $40
slid:
    RTS
notopen:
    CMP #$02
    BNE closing
    TXA
    BEQ slid
    LDA #$03
    STA $40
    RTS
closing:
    CLC
    LDA $41
    ADC #$04
    STA $41
    CMP #$F0
    BNE slid
    LDA #$00
    STA $40
    STA $41
    STA $42
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
;; Across: Right adds 10/256 a frame up to 1.5 pixels a frame; without
;; it the speed falls by the same until it is 0. The trees stop it.
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
    CMP #$E0
    BCC inside
    LDA #$E0
    STA $11
    LDA #$00
    STA $12
    STA $13
inside:
    RTS
;; The square: four sprites of tile 1, two by two, on the floor; out of
;; sight while the item screen is anywhere in view.
draw:
    LDA #$FF
    LDX $40
    BNE away
    LDA #$9F
away:
    STA $0200
    STA $0204
    CMP #$FF
    BEQ under
    CLC
    ADC #$08
under:
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
colours:
    .byte $0F,$30,$27,$1A,$0F,$30,$27,$1A,$0F,$30,$27,$1A,$0F,$30,$27,$1A
    .byte $0F,$16,$27,$30,$0F,$16,$27,$30,$0F,$16,$27,$30,$0F,$16,$27,$30
