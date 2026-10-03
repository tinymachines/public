;; The scroll lesson with a status bar over it that does not move, the
;; way Super Mario Bros. keeps its score and time still while the level
;; scrolls under them. The game was seen setting the level's scroll at
;; picture line 31 every frame and 0 in the blank, and rewriting its
;; timer, three tiles, about every 24 frames and nothing else in the
;; bar. Here the bar is the top four rows of name table 0; the blank
;; sets the scroll to 0 for it; then, after the interrupt, the program
;; waits for sprite 0 (behind the bar's bottom line, at line 31) to be
;; drawn over a solid pixel, which the picture chip says by a flag, and
;; sets the level's scroll for everything below. The timer starts at 400
;; and counts down one every 24 frames, written only when it changes.
;;
;; Memory as in the scroll lesson, and: $70 to $72 the timer's digits,
;; $73 the frames to its next tick, $74 a new time waiting for the NMI.
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
;; Both name tables to sky, then every one of the 64 columns as the
;; strips will build them.
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
    LDA #$00
    STA $04
first:
    LDA $04
    JSR prepcol
    JSR putcol
    INC $04
    LDA $04
    CMP #$40
    BNE first
;; The bar: row 3 is a line along its bottom, and the time is at row 2,
;; column 26. Sprite 0 sits behind the line at x 8.
    LDA #$20
    STA $2006
    LDA #$60
    STA $2006
    LDA #$06
    LDX #$20
bar:
    STA $2007
    DEX
    BNE bar
    LDA #$04
    STA $70
    LDA #$18
    STA $73
    LDA #$20
    STA $2006
    LDA #$5A
    STA $2006
    LDA #$14
    STA $2007
    LDA #$10
    STA $2007
    STA $2007
    LDA #$1E
    STA $0200
    LDA #$07
    STA $0201
    LDA #$20
    STA $0202
    LDA #$08
    STA $0203
    LDA #$28
    STA $11
    LDA #$B0
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
;; The split: wait for the flag from the last picture to clear, then for
;; sprite 0 to be drawn over the bar's line; everything under it gets
;; the level's scroll.
oldhit:
    BIT $2002
    BVS oldhit
newhit:
    BIT $2002
    BVC newhit
    LDA $21
    AND #$01
    ORA #$80
    STA $2000
    LDA $20
    STA $2005
    LDA #$00
    STA $2005
    JSR readpad
    JSR walk
    JSR jump
    JSR camera
    JSR strips
    JSR timer
    JSR draw
    JMP main
;; The timer: one off every 24 frames, from 400 down to 0.
timer:
    DEC $73
    BNE ticked
    LDA #$18
    STA $73
    LDA $70
    ORA $71
    ORA $72
    BEQ ticked
    DEC $72
    BPL newtime
    LDA #$09
    STA $72
    DEC $71
    BPL newtime
    LDA #$09
    STA $71
    DEC $70
newtime:
    LDA #$01
    STA $74
ticked:
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
    LDA $18
    ADC #$00
    STA $18
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
;; The camera: once the square is more than 112 pixels from the left
;; edge, the camera takes up the difference, so the square stays there.
camera:
    SEC
    LDA $11
    SBC $20
    STA $04
    LDA $18
    SBC $21
    BNE follow
    LDA $04
    CMP #$71
    BCC still
follow:
    LDA $04
    SEC
    SBC #$70
    CLC
    ADC $20
    STA $20
    LDA $21
    ADC #$00
    STA $21
still:
    RTS
;; The strips. A countdown in progress goes on; otherwise a new 32-pixel
;; step of the camera starts one, for the strip eleven past it: three
;; strips beyond the right edge, as far ahead as Mario builds.
strips:
    LDA $23
    BEQ new
    DEC $23
    LDA $23
    BEQ attr
    CMP #$06
    BEQ col0
    CMP #$05
    BEQ col1
    CMP #$02
    BEQ col2
    CMP #$01
    BEQ col3
    RTS
col0:
    LDA #$00
    JMP column
col1:
    LDA #$01
    JMP column
col2:
    LDA #$02
    JMP column
col3:
    LDA #$03
column:
    STA $04
    LDA $2B
    ASL A
    ASL A
    CLC
    ADC $04
    JSR prepcol
    LDA #$01
    STA $25
    RTS
attr:
    JSR prepattr
    LDA #$01
    STA $28
    RTS
new:
    LDA $21
    ASL A
    ASL A
    ASL A
    STA $04
    LDA $20
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    ORA $04
    CMP $22
    BEQ nostrip
    STA $22
    CLC
    ADC #$0B
    STA $2B
    LDA #$07
    STA $23
nostrip:
    RTS
;; One column of the land, A = its number counted from the start of
;; the world (0 to 255; the name tables hold 64 of them, so the address
;; takes the low six bits), into $30 to $49 with its address in
;; $26/$27. From row 24 down it is ground. Every 32nd column, from the
;; 20th, is a post standing on the ground, one to four tiles high by
;; how far along it is; every 16th, from the 8th, has a block in the
;; sky, higher or lower by how far along it is.
prepcol:
    STA $05
    AND #$1F
    CLC
    ADC #$80
    STA $27
    LDA $05
    AND #$20
    LSR A
    LSR A
    LSR A
    ORA #$20
    STA $26
    LDA #$FF
    STA $07
    STA $08
    LDA $05
    AND #$1F
    CMP #$14
    BNE nopost
    LDA $05
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    AND #$03
    EOR #$FF
    CLC
    ADC #$18
    STA $07
nopost:
    LDA $05
    AND #$0F
    CMP #$08
    BNE noblock
    LDA $05
    LSR A
    LSR A
    LSR A
    LSR A
    AND #$07
    CLC
    ADC #$0A
    STA $08
noblock:
    LDX #$00
row:
    TXA
    CLC
    ADC #$04
    CMP #$18
    BCS soil
    CMP $08
    BEQ block
    CMP $07
    BCS block
    LDA #$00
    JMP put
block:
    LDA #$03
    JMP put
soil:
    LDA #$02
put:
    STA $30,X
    INX
    CPX #$1A
    BNE row
    RTS
;; The strip's colour choices: rows 1 to 7 of the attribute table over
;; its 32 pixels, all the first palette here.
prepattr:
    LDA $2B
    AND #$08
    LSR A
    ORA #$23
    STA $29
    LDA $2B
    AND #$07
    CLC
    ADC #$C8
    STA $2A
    LDX #$00
    LDA #$00
attrs:
    STA $50,X
    INX
    CPX #$07
    BNE attrs
    RTS
;; A column into the picture chip, going down: $2000 steps by 32. $06
;; is what $2000 holds otherwise (0 while starting, with the NMI off;
;; $80 after), so a column written at the start is not cut short by an
;; NMI turning the step back to 1 halfway down.
putcol:
    LDA $06
    ORA #$04
    STA $2000
    LDA $26
    STA $2006
    LDA $27
    STA $2006
    LDX #$00
down:
    LDA $30,X
    STA $2007
    INX
    CPX #$1A
    BNE down
    LDA $06
    STA $2000
    RTS
;; The square, where it is on the screen: its x less the camera's.
draw:
    LDA $15
    SEC
    SBC #$01
    STA $0210
    STA $0214
    CLC
    ADC #$08
    STA $0218
    STA $021C
    LDA #$01
    STA $0211
    STA $0215
    STA $0219
    STA $021D
    LDA #$00
    STA $0212
    STA $0216
    STA $021A
    STA $021E
    LDA $11
    SEC
    SBC $20
    STA $0213
    STA $021B
    CLC
    ADC #$08
    STA $0217
    STA $021F
    RTS
;; In the blank: the sprites, a waiting column, a waiting colour column,
;; a new time, then the bar's scroll; the level's is set at the split.
nmi:
    PHA
    TXA
    PHA
    LDA #$00
    STA $2003
    LDA #$02
    STA $4014
    LDA $25
    BEQ nocol
    JSR putcol
    LDA #$00
    STA $25
nocol:
    LDA $28
    BEQ noattr
    LDX #$00
colours2:
    LDA $29
    STA $2006
    TXA
    ASL A
    ASL A
    ASL A
    CLC
    ADC $2A
    STA $2006
    LDA $50,X
    STA $2007
    INX
    CPX #$07
    BNE colours2
    LDA #$00
    STA $28
noattr:
    LDA $74
    BEQ notime
    LDA #$20
    STA $2006
    LDA #$5A
    STA $2006
    LDX #$00
digits:
    LDA $70,X
    CLC
    ADC #$10
    STA $2007
    INX
    CPX #$03
    BNE digits
    LDA #$00
    STA $74
notime:
;; The bar's scroll: name table 0, from its left edge.
    LDA #$80
    STA $2000
    LDA #$00
    STA $2005
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
    .byte $21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
