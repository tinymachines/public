;; The sound lesson's square and tune with a pause. Start stops the
;; world: the square holds where it is, the tune is cut on that frame
;; and a chime of three notes of our own plays on the second square
;; channel. For 32 frames after a press Start is ignored, so a press that
;; bounces or comes too soon cannot undo it. Nothing is drawn: the
;; picture is left exactly as it was, and the console keeps showing it.
;; Unpausing plays the chime again and the square moves on at once; the
;; tune waits out the 32 frames and comes back at its next note. Super
;; Mario Bros. was seen pausing that way (the world held, nothing drawn,
;; its music cut, a short sound, Start ignored for a while, the music
;; back after it); the numbers and the sound are ours.
;;
;; Memory: $00 the frame flag the NMI sets, $01 the pad, $02 the pad a
;; frame ago, $03 1 while in the air, $10/$11 x (fraction, pixel),
;; $12/$13 the speed across, $14/$15 y, $16/$17 the speed down, $50 the
;; tune's note, $51 frames left of it, $52 frames the jump sound still
;; holds the channel, $53 1 while paused, $54 frames Start is still
;; ignored, $55 chime notes still to play, $56 frames to the next one.
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
;; The palette: sky, ground and the square.
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
;; Name table 0: sky, then six rows of ground from row 24.
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
    LDA #$00
    STA $2006
    LDA #$02
    LDX #$C0
ground:
    STA $2007
    DEX
    BNE ground
    LDA #$28
    STA $11
    LDA #$B0
    STA $15
    LDA #$00
    STA $2005
    STA $2005
    LDA #$03
    STA $4015
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
    JSR pause
    JSR chime
;; Paused: nothing else runs, so nothing moves and nothing is drawn.
    LDA $53
    BNE main
    JSR walk
    JSR jump
    JSR tune
    JSR draw
    JMP main
;; Start: a new press flips the pause, unless one came in the last 32
;; frames. Either way the sound is cut, the chime starts, and the tune's
;; next note is due as soon as it may play.
pause:
    LDA $54
    BEQ ready
    DEC $54
    RTS
ready:
    LDA $02
    EOR #$FF
    AND $01
    AND #$10
    BEQ none
    LDA $53
    EOR #$01
    STA $53
    LDA #$20
    STA $54
    LDA #$00
    STA $4015
    STA $51
    STA $52
    STA $56
    LDA #$03
    STA $4015
    STA $55
none:
    RTS
;; The chime: three short notes on the second square channel, 8 frames
;; apart, rising.
chime:
    LDA $55
    BEQ quiet
    DEC $56
    BPL quiet
    LDA #$07
    STA $56
    DEC $55
    LDX $55
    LDA #$9C
    STA $4004
    LDA #$00
    STA $4005
    LDA chimenote,X
    STA $4006
    LDA #$00
    STA $4007
quiet:
    RTS
;; The chime's notes as periods, last first: high, middle, low.
chimenote:
    .byte $7E,$A9,$D5
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
    JSR jumpsound
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
;; The jump sound: the first square channel, a half-and-half wave whose
;; loudness falls away by itself, the pitch sweep on and rising, from a
;; low note. It holds the channel for 10 frames.
jumpsound:
    LDA #$84
    STA $4000
    LDA #$9B
    STA $4001
    LDA #$90
    STA $4002
    LDA #$11
    STA $4003
    LDA #$0A
    STA $52
    RTS
;; The tune: a note every 16 frames, round the eight. Just after a
;; pause it waits until Start may be pressed again. While the jump
;; sound holds the channel the tune only counts; it writes again at its
;; next note after the jump sound has let go.
tune:
    LDA $54
    BNE held
    LDA $52
    BEQ free
    DEC $52
free:
    DEC $51
    BPL held
    LDA #$0F
    STA $51
    LDX $50
    INX
    TXA
    AND #$07
    STA $50
    LDA $52
    BNE held
    LDX $50
    LDA #$B6
    STA $4000
    LDA #$08
    STA $4001
    LDA notelow,X
    STA $4002
    LDA notehigh,X
    STA $4003
held:
    RTS
;; Our tune's notes as the square channel's periods: C E G C, G E F D.
notelow:
    .byte $AA,$52,$1C,$D5,$1C,$52,$3F,$7C
notehigh:
    .byte $09,$09,$09,$08,$09,$09,$09,$09
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
    LDA #$00
    STA $2005
    STA $2005
    LDA #$01
    STA $00
    PLA
    RTI
irq:
    RTI
colours:
    .byte $21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
