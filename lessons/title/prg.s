;; A title screen drawn into the level, a menu with a cursor, and a demo
;; that plays by itself. Super Mario Bros. was seen doing it this way: it
;; draws the first screen of its level a few columns a frame, then writes
;; its title box into that same picture, so the title is part of the
;; level; its cursor is a column of three background tiles rewritten when
;; Select is pressed, not a sprite; a countdown that Select starts over
;; runs out into a demo, where the level plays by itself and the title
;; box scrolls away with it; when the demo ends, or Start is pressed
;; during it, both name tables are cleared and everything is drawn again
;; from the start. Here the level is
;; two screens of our own, 4 columns a frame; the box says SQUARE, one row
;; a frame; the countdown is 18 steps of 20 frames; the demo is a list of
;; presses of our own. Start on the title wipes the box and the menu and
;; hands the square to the player.
;;
;; Memory: $00 the frame flag the NMI sets, $01 the pad, $02 the pad a
;; frame ago, $03 1 while in the air, $10/$11 x (fraction, pixel), $18
;; x's screen, $12/$13 the speed across, $14/$15 y, $16/$17 the speed
;; down, $40 the stage (0 drawing the level, 1 the box, 2 the menu, 3 the
;; title waiting, 4 the demo, 5 playing, 6 wiping the title, 7 clearing
;; the name tables), $41 the next table, column or row to draw, $43 the players (0 one, 1 two), $44
;; frames into this step of the countdown, $45 steps left, $46 where the
;; demo is in its list, $47 frames left of that entry, $48/$49 the
;; camera (pixel, screen), $08 the demo's pad a frame ago, $09 1 when the
;; cursor needs drawing, $0A the demo's pad for this entry.
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
;; The palette: sky, white, brown, dark.
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
    JSR start
    LDA #$80
    STA $2000
main:
    LDA $00
    BEQ main
    LDA #$00
    STA $00
;; Writes to the picture first, while the picture is not being drawn,
;; then the scroll, then the frame's work.
    JSR picture
    JSR scroll
    JSR readpad
    LDX $40
    CPX #$03
    BNE notitle
    JSR waiting
    JMP frame
notitle:
    CPX #$04
    BNE nodemo
    JSR demo
    JMP frame
nodemo:
    CPX #$05
    BNE frame
    JSR walk
    JSR jump
frame:
    JSR camera
    JSR draw
    JMP main
;; Everything as at power on: the square on the ground at the left, the
;; camera at the start, the countdown full, and both name tables to
;; clear before the level is drawn.
start:
    LDA #$07
    STA $40
    LDA #$00
    STA $41
    STA $10
    STA $18
    STA $12
    STA $13
    STA $14
    STA $16
    STA $17
    STA $03
    STA $48
    STA $49
    STA $44
    STA $46
    STA $47
    STA $08
    LDA #$28
    STA $11
    LDA #$B0
    STA $15
    LDA #$12
    STA $45
    RTS
;; This frame's writes to the picture, by stage.
picture:
    LDA $40
    BNE notlevel
    JMP level
notlevel:
    CMP #$01
    BNE notbox
    JMP box
notbox:
    CMP #$02
    BNE notmenu
    JMP menu
notmenu:
    CMP #$06
    BNE notwipe
    JMP wipebox
notwipe:
    CMP #$07
    BNE notclear
    JMP tables
notclear:
    LDA $09
    BEQ nopic
    JMP cursor
nopic:
    RTS
;; Both name tables cleared, one a frame, with the picture off: 1024
;; tiles and colours each. Then the picture back on, and the level.
tables:
    LDA #$00
    STA $2001
    LDA $41
    ASL A
    ASL A
    ORA #$20
    STA $2006
    LDA #$00
    STA $2006
    LDY #$04
    TAX
empty:
    STA $2007
    INX
    BNE empty
    DEY
    BNE empty
    INC $41
    LDA $41
    CMP #$02
    BNE cleared
    LDA #$00
    STA $41
    STA $40
    LDA #$1E
    STA $2001
cleared:
    RTS
;; The level: four columns a frame, 64 in all across both name tables,
;; each from row 18 down: a block in some columns, sky, then six rows of
;; ground. The step is 32, so each write goes one row down.
level:
    LDA #$84
    STA $2000
    LDY #$04
levcol:
    LDA $41
    AND #$20
    LSR A
    LSR A
    LSR A
    ORA #$22
    STA $2006
    LDA $41
    AND #$1F
    ORA #$40
    STA $2006
    LDA $41
    AND #$0F
    CMP #$09
    BCC nobrick
    CMP #$0C
    BCS nobrick
    LDA #$03
    JMP top
nobrick:
    LDA #$00
top:
    STA $2007
    LDA #$00
    LDX #$05
air:
    STA $2007
    DEX
    BNE air
    LDA #$02
    LDX #$06
soil:
    STA $2007
    DEX
    BNE soil
    INC $41
    DEY
    BNE levcol
    LDA $41
    CMP #$40
    BNE levdone
    LDA #$00
    STA $41
    LDA #$01
    STA $40
levdone:
    RTS
;; The box: six rows of 16 from row 4, one row a frame, SQUARE on its
;; third row.
box:
    LDA #$80
    STA $2000
    JSR boxrow
    LDA $41
    CMP #$02
    BNE plain
    LDX #$00
word:
    LDA name,X
    STA $2007
    INX
    CPX #$10
    BNE word
    JMP rowdone
plain:
    LDA #$05
    LDX #$10
fill:
    STA $2007
    DEX
    BNE fill
rowdone:
    INC $41
    LDA $41
    CMP #$06
    BNE boxdone
    LDA #$02
    STA $40
boxdone:
    RTS
;; The address of the box's row $41: $2088 and 32 on for each row, the
;; low byte worked out first so its carry reaches the high one.
boxrow:
    LDA $41
    ASL A
    ASL A
    ASL A
    ASL A
    ASL A
    CLC
    ADC #$88
    TAY
    LDA $41
    LSR A
    LSR A
    LSR A
    ADC #$20
    STA $2006
    STY $2006
    RTS
;; The box's third row: SQUARE spaced out, on the box's colour.
name:
    .byte $05,$05,$05,$18,$05,$19,$05,$1A,$05,$1B,$05,$1C,$05,$1D,$05,$05
;; The menu, in one frame: two lines of words, then the cursor.
menu:
    LDA #$80
    STA $2000
    LDA #$21
    STA $2006
    LDA #$CB
    STA $2006
    LDX #$00
one:
    LDA line1,X
    STA $2007
    INX
    CPX #$08
    BNE one
    LDA #$22
    STA $2006
    LDA #$0B
    STA $2006
    LDX #$00
two:
    LDA line2,X
    STA $2007
    INX
    CPX #$09
    BNE two
    LDA #$03
    STA $40
;; The cursor: a column of three tiles at row 14, column 9, the cursor at
;; the top for one player and at the bottom for two.
cursor:
    LDA #$84
    STA $2000
    LDA #$21
    STA $2006
    LDA #$C9
    STA $2006
    LDX #$04
    LDY #$00
    LDA $43
    BEQ first
    LDX #$00
    LDY #$04
first:
    STX $2007
    LDA #$00
    STA $2007
    STY $2007
    LDA #$00
    STA $09
    RTS
;; 1 PLAYER and 2 PLAYERS, in our letters.
line1:
    .byte $06,$00,$0B,$0A,$08,$0E,$09,$0C
line2:
    .byte $07,$00,$0B,$0A,$08,$0E,$09,$0C,$0D
;; Start on the title: the box's rows go back to sky one a frame, from
;; the bottom, then the menu's lines and the cursor in one frame.
wipebox:
    LDA #$80
    STA $2000
    LDA $41
    CMP #$06
    BCS wipemenu
    JSR boxrow
    LDA #$00
    LDX #$10
blank:
    STA $2007
    DEX
    BNE blank
    INC $41
    RTS
wipemenu:
    LDA #$21
    STA $2006
    LDA #$C9
    STA $2006
    LDA #$00
    LDX #$4C
gone:
    STA $2007
    DEX
    BNE gone
    LDA #$05
    STA $40
    RTS
;; The scroll for the frame: the camera, and its screen in the control
;; register. The writes above moved the address, so this always follows.
scroll:
    LDA $49
    ORA #$80
    STA $2000
    LDA $48
    STA $2005
    LDA #$00
    STA $2005
    RTS
;; The title, waiting: Select moves the cursor and starts the countdown
;; over; Start wipes the title for play; the countdown running out starts
;; the demo.
waiting:
    LDA $02
    EOR #$FF
    AND $01
    TAX
    AND #$20
    BEQ noselect
    LDA $43
    EOR #$01
    STA $43
    LDA #$01
    STA $09
    LDA #$00
    STA $44
    LDA #$12
    STA $45
    RTS
noselect:
    TXA
    AND #$10
    BEQ count
    LDA #$00
    STA $41
    LDA #$06
    STA $40
    RTS
count:
    INC $44
    LDA $44
    CMP #$14
    BNE still
    LDA #$00
    STA $44
    DEC $45
    BNE still
    LDA #$04
    STA $40
still:
    RTS
;; The demo: the pad is read only for Start, which brings the title back;
;; the square is moved by the list instead, entry by entry (frames, then
;; the pad), until an entry of 0 frames, which also brings the title back.
demo:
    LDA $02
    EOR #$FF
    AND $01
    AND #$10
    BNE over
    LDA $47
    BNE playing
    LDX $46
    LDA presses,X
    BEQ over
    STA $47
    INX
    LDA presses,X
    STA $0A
    INX
    STX $46
playing:
    DEC $47
    LDA $08
    STA $02
    LDA $0A
    STA $01
    STA $08
    JSR walk
    JSR jump
    RTS
over:
    JSR start
    RTS
;; The demo's presses: frames, then the pad (A is $80, Right $01).
presses:
    .byte 60,$01, 20,$81, 50,$01, 30,$81, 70,$01, 40,$00, 0
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
;; it the speed falls by the same until it is 0. The square stops at the
;; end of the second screen.
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
    LDA $18
    ADC #$00
    STA $18
    BEQ inside
    LDA $11
    CMP #$F0
    BCC inside
    LDA #$F0
    STA $11
    LDA #$00
    STA $12
    STA $13
inside:
    RTS
;; Up and down: a new press of A on the ground starts a jump.
jump:
    LDA $03
    BNE inair
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
inair:
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
;; The camera keeps the square 96 pixels from the left, between the start
;; of the first screen and the start of the second.
camera:
    SEC
    LDA $11
    SBC #$60
    STA $48
    LDA $18
    SBC #$00
    STA $49
    BCS ahead
    LDA #$00
    STA $48
    STA $49
    RTS
ahead:
    BEQ inview
    LDA #$00
    STA $48
inview:
    RTS
;; The square: four sprites of tile 1, two by two, where the camera sees
;; it.
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
    SEC
    LDA $11
    SBC $48
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
    .byte $21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07,$21,$30,$17,$07
    .byte $21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30,$21,$16,$27,$30
