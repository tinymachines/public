;; A screen for typing a name: a grid of our letters, a cursor that moves
;; over it, and the name above. The Legend of Zelda was seen doing it
;; this way: the cursor is a sprite drawn behind the background, so the
;; letter under it shows through, and it blinks; it moves the frame after
;; a press, and held it moves again after a wait, then faster; at an edge
;; it carries on round the grid in reading order, so left from the first
;; letter is the last cell; every step makes a click; and A writes the
;; letter into the name, one tile, the frame after. Here the grid is 10
;; across and 4 down; the cursor blinks 16 frames on and 16 off; held, it
;; waits 20 frames and then moves every 6; the click and the letters are
;; our own. The name takes eight letters; after that A writes nothing.
;;
;; Memory: $00 the frame flag the NMI sets, $01 the pad, $02 the pad a
;; frame ago, $05 frames counted, $06 frames until a held direction moves
;; again, $40 the cell under the cursor (0 to 39), $41 the letters in the
;; name, $42 a letter waiting to be written (0 for none), $43 where.
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
;; The palette: black, white; the cursor red.
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
;; The screen, drawn once with the picture off: the table empty, the
;; heading, the line the name sits on, and the grid, a cell every other
;; column on every other row.
    LDA #$20
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
    LDA #$20
    STA $2006
    LDA #$6B
    STA $2006
    LDX #$00
heading:
    LDA words,X
    STA $2007
    INX
    CPX #$09
    BNE heading
    LDA #$20
    STA $2006
    LDA #$EC
    STA $2006
    LDA #$02
    LDX #$08
under:
    STA $2007
    DEX
    BNE under
    LDY #$00
gridrow:
    LDA rowhigh,Y
    STA $2006
    LDA rowlow,Y
    STA $2006
    LDX #$00
gridcell:
    TYA
    ASL A
    STA $03
    ASL A
    ASL A
    CLC
    ADC $03
    STA $03
    TXA
    CLC
    ADC $03
    JSR tileof
    STA $2007
    LDA #$00
    STA $2007
    INX
    CPX #$0A
    BNE gridcell
    INY
    CPY #$04
    BNE gridrow
    LDA #$01
    STA $4015
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
;; A letter waiting is written first, while the picture is not being
;; drawn, then the scroll is put back.
    LDA $42
    BEQ nothing
    LDA #$20
    STA $2006
    LDA $43
    STA $2006
    LDA $42
    STA $2007
    LDA #$00
    STA $42
    STA $2005
    STA $2005
    LDA #$80
    STA $2000
nothing:
    INC $05
    JSR readpad
    JSR steer
    JSR type
    JSR draw
    JMP main
;; The tile in a cell: our letters from 16 in the grid's order, and the
;; last cell empty.
tileof:
    CMP #$27
    BCS blank
    CLC
    ADC #$10
    RTS
blank:
    LDA #$00
    RTS
;; Up, Down, Left and Right (bits 3 to 0 of the pad). A new press moves
;; at once and sets the wait at 20 frames; held, the cursor moves again
;; when the wait runs out, and then every 6.
steer:
    LDA $01
    AND #$0F
    BEQ still
    LDA $02
    AND #$0F
    BNE held
    LDA #$14
    STA $06
    JMP step
held:
    DEC $06
    BNE still
    LDA #$06
    STA $06
step:
    LDA $01
    LSR A
    BCS right
    LSR A
    BCS left
    LSR A
    BCS down
    LDA $40
    SEC
    SBC #$0A
    BCS moved
    ADC #$28
    JMP moved
down:
    LDA $40
    CLC
    ADC #$0A
    CMP #$28
    BCC moved
    SBC #$28
    JMP moved
left:
    LDA $40
    SEC
    SBC #$01
    BCS moved
    LDA #$27
    JMP moved
right:
    LDA $40
    CLC
    ADC #$01
    CMP #$28
    BCC moved
    LDA #$00
moved:
    STA $40
;; The click: a short high note on the first square channel.
    LDA #$9F
    STA $4000
    LDA #$00
    STA $4001
    LDA #$40
    STA $4002
    LDA #$00
    STA $4003
still:
    RTS
;; A new press of A: the letter under the cursor waits to be written at
;; the end of the name, while the name has room. The empty cell types a
;; space: nothing is written and the name moves on.
type:
    LDA $02
    EOR #$FF
    AND $01
    AND #$80
    BEQ full
    LDA $41
    CMP #$08
    BCS full
    CLC
    ADC #$CC
    STA $43
    INC $41
    LDA $40
    JSR tileof
    STA $42
full:
    RTS
;; Two sprites of the box, drawn behind the background: on the cell under
;; the cursor and where the next letter of the name goes, both shown for
;; 16 frames and hidden for 16.
draw:
    LDA $05
    AND #$10
    BEQ shown
    LDA #$FF
    STA $0200
    STA $0204
    RTS
shown:
    LDA $40
    LDX #$00
row:
    CMP #$0A
    BCC found
    SBC #$0A
    INX
    JMP row
found:
    ASL A
    ASL A
    ASL A
    ASL A
    CLC
    ADC #$30
    STA $0203
    LDA cursory,X
    STA $0200
    LDA #$01
    STA $0201
    STA $0205
    LDA #$20
    STA $0202
    STA $0206
    LDA #$2F
    STA $0204
    LDA $41
    ASL A
    ASL A
    ASL A
    CLC
    ADC #$60
    STA $0207
    RTS
;; The grid's rows: where each starts in the name table, and the cursor's
;; height on each.
rowhigh:
    .byte $21,$21,$22,$22
rowlow:
    .byte $A6,$E6,$26,$66
cursory:
    .byte $67,$77,$87,$97
;; YOUR NAME, in our letters.
words:
    .byte $28,$1E,$24,$21,$00,$1D,$10,$1C,$14
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
    .byte $0F,$30,$16,$30,$0F,$30,$16,$30,$0F,$30,$16,$30,$0F,$30,$16,$30
    .byte $0F,$16,$27,$30,$0F,$16,$27,$30,$0F,$16,$27,$30,$0F,$16,$27,$30
