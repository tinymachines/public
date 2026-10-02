;; Three screens and one byte that chooses between them: a title that
;; waits for Start, the jump lesson's square to play with, and a pause.
;; Super Mario Bros. was seen keeping its screen in one byte of memory
;; and choosing what runs each frame through a table of addresses after
;; a call (the autopsy's jump engine). This does the same: $40 is the
;; screen (0 the title, 1 playing, 2 paused), and every frame `engine`
;; takes the address from the table after the call that reached it.
;; Paused, nothing moves: the routine for it only waits for Start.
;;
;; Memory as in the jump lesson, and: $04/$05 where the table is, $06/$07
;; the address taken from it, $40 the screen.
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
;; Both name tables to sky; ground in table 0 (the playing screen), the
;; words PRESS START in table 1 (the title).
    LDA #$20
    STA $2006
    LDA #$00
    STA $2006
    LDY #$08
    TAX
sky:
    STA $2007
    INX
    BNE sky
    DEY
    BNE sky
    LDA #$23
    STA $2006
    LDA #$00
    STA $2006
    LDA #$02
    LDX #$C0
ground:
    STA $2007
    DEX
    BNE ground
    LDA #$25
    STA $2006
    LDA #$CA
    STA $2006
    LDX #$00
title:
    LDA words,X
    STA $2007
    INX
    CPX #$0B
    BNE title
    LDA #$28
    STA $11
    LDA #$B0
    STA $15
    LDA #$00
    STA $2005
    STA $2005
    LDA #$81
    STA $2000
    LDA #$1E
    STA $2001
main:
    LDA $00
    BEQ main
    LDA #$00
    STA $00
    JSR readpad
    JSR screen
    JSR draw
    JMP main
;; What runs this frame, by the screen: the table after the call.
screen:
    LDA $40
    JSR engine
    .word on_title
    .word on_play
    .word on_pause
;; The jump engine: A is the entry. The call's return address, taken off
;; the stack, is one byte short of the table that follows the call; the
;; entry's two bytes are an address, and the jump goes there. Each entry
;; ends with RTS, which returns past the call to `screen`: the engine
;; took its own return address off the stack, so the one left on top is
;; main's. (Reached from main directly, there would be none, and the RTS
;; would go wherever the stack's next two bytes said.)
engine:
    ASL A
    TAY
    PLA
    STA $04
    PLA
    STA $05
    INY
    LDA ($04),Y
    STA $06
    INY
    LDA ($04),Y
    STA $07
    JMP ($06)
;; Start, pressed this frame and not the one before: in A, 0 or not.
pressed:
    LDA $02
    EOR #$FF
    AND $01
    AND #$10
    RTS
on_title:
    JSR pressed
    BEQ stay
    LDA #$01
    STA $40
stay:
    RTS
on_play:
    JSR pressed
    BEQ playing
    LDA #$02
    STA $40
    RTS
playing:
    JSR walk
    JSR jump
    RTS
on_pause:
    JSR pressed
    BEQ held
    LDA #$01
    STA $40
held:
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
;; it the speed falls by the same until it is 0.
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
    BNE top
    LDA $12
    CMP #$80
    BCC move
top:
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
    RTS
;; Up and down: a new press of A on the ground starts a jump.
jump:
    LDA $03
    BNE air
    LDA $02
    EOR #$FF
    AND $01
    AND #$80
    BEQ done
    LDA #$00
    STA $16
    LDA #$FC
    STA $17
    LDA #$01
    STA $03
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
    BMI fall
    CMP #$04
    BCC fall
    LDA #$00
    STA $16
    LDA #$04
    STA $17
fall:
    LDA $17
    BMI done
    LDA $15
    CMP #$B0
    BCC done
    LDA #$B0
    STA $15
    LDA #$00
    STA $14
    STA $16
    STA $17
    STA $03
done:
    RTS
;; The sprites: on the title none; playing, the square; paused, the
;; square where it stopped and the word PAUSED over it, in sprites of
;; the second palette.
draw:
    LDA #$FF
    LDX #$00
off:
    STA $0200,X
    INX
    BNE off
    LDA $40
    BEQ drawn
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
    LDA $40
    CMP #$02
    BNE drawn
    LDX #$00
    LDY #$00
paused:
    LDA #$5F
    STA $0210,Y
    LDA pausedw,X
    STA $0211,Y
    LDA #$01
    STA $0212,Y
    TXA
    ASL A
    ASL A
    ASL A
    CLC
    ADC #$68
    STA $0213,Y
    INY
    INY
    INY
    INY
    INX
    CPX #$06
    BNE paused
drawn:
    RTS
nmi:
    PHA
    LDA #$00
    STA $2003
    LDA #$02
    STA $4014
    LDA $40
    BNE table0
    LDA #$81
    JMP shown
table0:
    LDA #$80
shown:
    STA $2000
    LDA #$00
    STA $2005
    STA $2005
    LDA #$01
    STA $00
    PLA
    RTI
irq:
    RTI
;; P R E S S, space, S T A R T and P A U S E D, as tiles.
words:
    .byte $07,$08,$06,$09,$09,$00,$09,$0A,$04,$08,$0A
pausedw:
    .byte $07,$04,$0B,$09,$06,$05
colours:
    .byte $21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07
    .byte $21,$16,$27,$30,$21,$30,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
