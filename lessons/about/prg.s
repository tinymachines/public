;; An about screen: our own words crawling up the screen, the way The
;; Legend of Zelda tells its story when the title is left alone. The game
;; was seen doing it this way: the text moves up one pixel every second
;; frame, for as long as it lasts, and nothing splits the picture; the
;; console holds two screens of background stacked one above the other,
;; and the scroll runs down through both and round again; each time the
;; text has moved up one row's height, 8 pixels, the game writes one new
;; row of 32 tiles into the row about to come into view, and nothing
;; else. Here the words are ours, a line on every other row, and when
;; they run out they start again; our row is written in the frames just
;; before it shows.
;;
;; Memory: $00 the frame flag the NMI sets, $20/$21 the next line of the
;; words, $40/$41 how far down the two screens the scroll is (0 to 479),
;; $42 frames into the step, $43 1 when the next row is a gap between
;; lines, $44 1 when a row is waiting to be written, $45/$46 where, $47
;; the scroll down within its screen, $48 which screen is at the top (0
;; or 2), $0300 to $031F the row.
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
;; The palette: black and white.
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
;; Both screens empty, picture off: 2048 tiles and colours.
    LDA #$20
    STA $2006
    LDA #$00
    STA $2006
    LDY #$08
    TAX
wipe:
    STA $2007
    INX
    BNE wipe
    DEY
    BNE wipe
    LDA wordslo
    STA $20
    LDA wordshi
    STA $21
    JSR prepare
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
;; A row waiting is written first, while the picture is not being drawn,
;; then the scroll.
    LDA $44
    BEQ none
    LDA #$80
    STA $2000
    LDA $45
    STA $2006
    LDA $46
    STA $2006
    LDX #$00
row:
    LDA $0300,X
    STA $2007
    INX
    CPX #$20
    BNE row
    LDA #$00
    STA $44
none:
    LDA $48
    ORA #$80
    STA $2000
    LDA #$00
    STA $2005
    LDA $47
    STA $2005
    JSR crawl
    JMP main
;; Every second frame the scroll moves down one pixel, round from 479 to
;; 0; each time it is a whole row down, the next row is made ready.
crawl:
    LDA $42
    EOR #$01
    STA $42
    BNE crawled
    INC $40
    BNE carried
    INC $41
carried:
    LDA $41
    BEQ within
    LDA $40
    CMP #$E0
    BCC within
    LDA #$00
    STA $40
    STA $41
within:
;; The register's view: within the top screen below 240, else the lower.
    LDA $41
    BNE lower
    LDA $40
    CMP #$F0
    BCS lower
    STA $47
    LDA #$00
    STA $48
    JMP view
lower:
    SEC
    LDA $40
    SBC #$F0
    STA $47
    LDA #$02
    STA $48
view:
    LDA $40
    AND #$07
    BNE crawled
    JSR prepare
crawled:
    RTS
;; The row 240 below the scroll, which comes into view as it next moves:
;; its place (counting down both screens, round at 480), and in it a line
;; of the words, centred, or the gap between two lines.
prepare:
    CLC
    LDA $40
    ADC #$F0
    STA $45
    LDA $41
    ADC #$00
    STA $46
    BEQ first
    LDA $45
    CMP #$E0
    BCC first
    SBC #$E0
    STA $45
    LDA #$00
    STA $46
first:
;; $45/$46 is now 0 to 479. Below 240 it is the top screen ($2000),
;; else the lower ($2800), 240 less.
    LDA #$20
    STA $49
    LDA $46
    BNE second
    LDA $45
    CMP #$F0
    BCC place
second:
    SEC
    LDA $45
    SBC #$F0
    STA $45
    LDA #$28
    STA $49
place:
;; The row's address: the screen's, and 32 for each 8 pixels.
    LDA $45
    AND #$F8
    ASL A
    ASL A
    STA $46
    LDA $45
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    ORA $49
    STA $45
    LDA #$00
    LDX #$1F
blank:
    STA $0300,X
    DEX
    BPL blank
    LDA $43
    EOR #$01
    STA $43
    BEQ ready
;; A line: its length, then its letters, placed in the middle. A length
;; of $FF is the end of the words, and they start again.
    LDY #$00
    LDA ($20),Y
    CMP #$FF
    BNE line
    LDA wordslo
    STA $20
    LDA wordshi
    STA $21
    LDA ($20),Y
line:
    TAX
    LDA #$20
    SEC
    STX $4A
    SBC $4A
    LSR A
    TAX
    LDY #$00
copy:
    CPY $4A
    BEQ copied
    INY
    LDA ($20),Y
    STA $0300,X
    INX
    JMP copy
copied:
    INY
    TYA
    CLC
    ADC $20
    STA $20
    LDA $21
    ADC #$00
    STA $21
ready:
    LDA #$01
    STA $44
    RTS
;; Where the words begin, a byte at a time.
wordslo:
    .byte <words
wordshi:
    .byte >words
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
    .byte $0F,$30,$30,$30,$0F,$30,$30,$30,$0F,$30,$30,$30,$0F,$30,$30,$30
    .byte $0F,$30,$30,$30,$0F,$30,$30,$30,$0F,$30,$30,$30,$0F,$30,$30,$30
;; The words, a line at a time: its length, then its letters (0 a space).
words:
;; SQUARE
    .byte $06,$22,$20,$24,$10,$21,$14
;; (a blank line)
    .byte $00
;; A SQUARE OF OUR OWN
    .byte $13,$10,$00,$22,$20,$24,$10,$21,$14,$00,$1E,$15,$00,$1E,$24,$21,$00,$1E,$26,$1D
;; WALKS AND JUMPS AND
    .byte $13,$26,$10,$1B,$1A,$22,$00,$10,$1D,$13,$00,$19,$24,$1C,$1F,$22,$00,$10,$1D,$13
;; STOMPS ITS WAY THROUGH
    .byte $16,$22,$23,$1E,$1C,$1F,$22,$00,$18,$23,$22,$00,$26,$10,$28,$00,$23,$17,$21,$1E,$24,$16,$17
;; THESE LESSONS.
    .byte $0E,$23,$17,$14,$22,$14,$00,$1B,$14,$22,$22,$1E,$1D,$22,$35
;; (a blank line)
    .byte $00
;; EVERY NUMBER ON ITS
    .byte $13,$14,$25,$14,$21,$28,$00,$1D,$24,$1C,$11,$14,$21,$00,$1E,$1D,$00,$18,$23,$22
;; PAGES WAS MEASURED
    .byte $12,$1F,$10,$16,$14,$22,$00,$26,$10,$22,$00,$1C,$14,$10,$22,$24,$21,$14,$13
;; AND NOT TYPED.
    .byte $0E,$10,$1D,$13,$00,$1D,$1E,$23,$00,$23,$28,$1F,$14,$13,$35
;; (a blank line)
    .byte $00
;; MADE IN A GARAGE
    .byte $10,$1C,$10,$13,$14,$00,$18,$1D,$00,$10,$00,$16,$10,$21,$10,$16,$14
;; BY TINY MACHINES.
    .byte $11,$11,$28,$00,$23,$18,$1D,$28,$00,$1C,$10,$12,$17,$18,$1D,$14,$22,$35
;; (a blank line)
    .byte $00
;; (a blank line)
    .byte $00
;; The end of the words.
    .byte $FF
