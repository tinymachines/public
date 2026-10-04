;; Ten figures on one line, two more than the console draws. The picture
;; chip draws at most eight sprites on any one line, the first eight it
;; finds in sprite memory, and leaves the rest out. Written in the same
;; order every frame, the same two figures are left out every frame and
;; are never seen. Super Mario Bros. was seen changing where an enemy's
;; sprites sit in sprite memory from one frame to the next, round a
;; cycle, so that no sprite is always the one left out: too many on a line
;; then flicker rather than vanish. Here Select turns that on and off:
;; off, the figures are written from the first every frame; on, each frame
;; starts one figure further on, round all ten.
;;
;; Memory: $00 the frame flag the NMI sets, $01 the pad, $02 the pad a
;; frame ago, $40 1 while the order turns, $41 the figure written first.
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
;; The palette: sky, and the figures in orange and white.
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
;; Name table 0: sky, then four rows of ground from row 26.
    LDA #$20
    STA $2006
    LDA #$00
    STA $2006
    LDY #$04
    TAX
sky:
    STA $2007
    INX
    BNE sky
    DEY
    BNE sky
    LDA #$23
    STA $2006
    LDA #$40
    STA $2006
    LDA #$02
    LDX #$80
ground:
    STA $2007
    DEX
    BNE ground
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
    JSR readpad
    JSR order
    JSR figures
    JMP main
;; Select turns the turning on or off; while it is on, each frame starts
;; one figure further on, round all ten.
order:
    LDA $02
    EOR #$FF
    AND $01
    AND #$20
    BEQ same
    LDA $40
    EOR #$01
    STA $40
same:
    LDA $40
    BEQ kept
    INC $41
    LDA $41
    CMP #$0A
    BCC kept
    LDA #$00
    STA $41
kept:
    RTS
;; Each figure, two sprites (head over body), written into sprite memory
;; at its place in this frame's order: the figure written first takes
;; the first two sprites, and so on round.
figures:
    LDX #$00
figure:
    TXA
    SEC
    SBC $41
    BCS placed
    ADC #$0A
placed:
    ASL A
    ASL A
    ASL A
    TAY
    LDA #$77
    STA $0200,Y
    LDA #$7F
    STA $0204,Y
    LDA #$06
    STA $0201,Y
    LDA #$07
    STA $0205,Y
    LDA #$00
    STA $0202,Y
    STA $0206,Y
    LDA across,X
    STA $0203,Y
    STA $0207,Y
    INX
    CPX #$0A
    BNE figure
    RTS
;; Where each figure stands across the screen.
across:
    .byte $14,$2A,$40,$56,$6C,$82,$98,$AE,$C4,$DA
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
    .byte $21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07,$21,$30,$27,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
