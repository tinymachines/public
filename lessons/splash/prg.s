;; A splash screen that moves without drawing. The Legend of Zelda's
;; title was seen doing it this way: once the picture is drawn, not one
;; tile is written while it shows. Its waterfall is a column of sprites
;; stepping down a few pixels a frame, jumping back up after a short loop
;; so the water seems to fall forever; its colours turn by rewriting one
;; palette every few frames; and when it has shown long enough it fades
;; to black by rewriting the whole palette darker, step by step. Here the
;; word SQUARE turns through three colours, one step every 8 frames; four
;; drops fall 3 pixels a frame and jump back every 8 frames; after 400
;; frames the palette darkens in 5 steps of 4 frames; after a second of
;; black it all comes back and starts again.
;;
;; Memory: $00 the frame flag the NMI sets, $40 the stage (0 showing, 1
;; fading, 2 dark), $41 the stage's count (steps of 4 frames), $42 frames
;; into the step, $43 the fade's step, $44 frames since the colours
;; turned, $45 where the drops are in their loop, $46 what to write to
;; the palette next (0 nothing, 1 the word's four colours, 2 all 32),
;; $0300 to $031F the palette as it is meant to look.
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
;; The palette into memory, then onto the chip.
    LDX #$1F
copypal:
    LDA colours,X
    STA $0300,X
    DEX
    BPL copypal
    LDA #$3F
    STA $2006
    LDA #$00
    STA $2006
    LDX #$00
pal:
    LDA $0300,X
    STA $2007
    INX
    CPX #$20
    BNE pal
;; The picture, drawn once with it off: the table empty, the word, and
;; its block of colours set to the word's palette.
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
    LDA #$21
    STA $2006
    LDA #$8D
    STA $2006
    LDX #$00
word:
    LDA name,X
    STA $2007
    INX
    CPX #$06
    BNE word
    LDA #$23
    STA $2006
    LDA #$DB
    STA $2006
    LDA #$55
    STA $2007
    STA $2007
    JSR again
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
;; Only the palette is ever written, while the picture is not being
;; drawn; then the scroll is put back.
    JSR palette
    JSR stage
    JSR drops
    JMP main
;; The start of a showing: the count full, the colours as meant.
again:
    LDA #$00
    STA $40
    STA $42
    STA $43
    STA $44
    LDA #$64
    STA $41
    LDA #$02
    STA $46
    RTS
palette:
    LDA $46
    BEQ written
    LDA #$3F
    STA $2006
    LDX $46
    LDA #$00
    STA $46
    CPX #$01
    BNE whole
;; The word's four colours.
    LDA #$04
    STA $2006
    LDX #$04
four:
    LDA $0300,X
    STA $2007
    INX
    CPX #$08
    BNE four
    JMP back
;; All 32, each darker by $10 for every step of the fade; a colour that
;; would go below the darkest row is black.
whole:
    LDA #$00
    STA $2006
    LDX #$00
dark:
    LDA $0300,X
    LDY $43
    BEQ put
darker:
    SEC
    SBC #$10
    BCC black
    DEY
    BNE darker
    JMP put
black:
    LDA #$0F
put:
    STA $2007
    INX
    CPX #$20
    BNE dark
back:
    LDA #$00
    STA $2005
    STA $2005
    LDA #$80
    STA $2000
written:
    RTS
;; Showing: the word's colours turn every 8 frames, and the count runs
;; down in steps of 4 frames. Fading: one step darker every 4 frames, 5
;; steps. Dark: a second, then again.
stage:
    LDA $40
    BNE notshow
    INC $44
    LDA $44
    CMP #$08
    BNE count
    LDA #$00
    STA $44
    LDA $0305
    LDX $0306
    STX $0305
    LDX $0307
    STX $0306
    STA $0307
    LDA #$01
    STA $46
count:
    INC $42
    LDA $42
    CMP #$04
    BNE wait
    LDA #$00
    STA $42
    DEC $41
    BNE wait
    LDA #$01
    STA $40
wait:
    RTS
notshow:
    INC $42
    LDA $42
    CMP #$04
    BNE wait
    LDA #$00
    STA $42
    LDA $40
    CMP #$01
    BNE dim
    INC $43
    LDA #$02
    STA $46
    LDA $43
    CMP #$05
    BNE wait
    LDA #$02
    STA $40
    LDA #$0F
    STA $41
    RTS
dim:
    DEC $41
    BNE wait
    JMP again
;; Four drops of tile 1, 24 pixels apart, from 120 down, moving 3 pixels
;; a frame; after 8 frames they have moved 24 and jump back, so the
;; column looks the same and seems to fall for ever.
drops:
    INC $45
    LDA $45
    CMP #$08
    BCC fallen
    LDA #$00
    STA $45
fallen:
    LDA $45
    ASL A
    ADC $45
    ADC #$78
    LDX #$00
drop:
    STA $0200,X
    PHA
    LDA #$01
    STA $0201,X
    LDA #$00
    STA $0202,X
    LDA #$7C
    STA $0203,X
    PLA
    CLC
    ADC #$18
    INX
    INX
    INX
    INX
    CPX #$10
    BNE drop
    RTS
;; SQUARE, in our letters.
name:
    .byte $22,$20,$24,$10,$21,$14
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
;; Black ground; the word's three colours; the drops in light blue.
colours:
    .byte $0F,$30,$30,$30,$0F,$21,$2A,$27,$0F,$30,$30,$30,$0F,$30,$30,$30
    .byte $0F,$21,$31,$30,$0F,$21,$31,$30,$0F,$21,$31,$30,$0F,$21,$31,$30
