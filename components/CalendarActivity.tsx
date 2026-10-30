import React,{useEffect,useRef,useState} from 'react';
import {PanResponder,Pressable,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {darkColors} from '../constants/theme';
import {DiaryEntry,diaryTime} from '../lib/model';
import {moveRange,minuteLabel,GRID_START,PIXELS_PER_MINUTE as PX} from '../lib/agenda';
type Props={entry:DiaryEntry;start:number;end:number;column:number;columns:number;displayTop?:number;dark:boolean;readOnly:boolean;onEdit:()=>void;onComplete:()=>void;onMove:(start:string,end:string)=>void;onDragging:(active:boolean)=>void};
export default function CalendarActivity(props:Props){
 const latest=useRef(props);latest.current=props;
 const [offset,setOffset]=useState(0),[active,setActive]=useState(false);
 const armed=useRef(false),claimed=useRef(false),suppress=useRef(false);
 const origin=useRef({start:0,end:0}),range=useRef({start:0,end:0});
 const reset=()=>{armed.current=false;claimed.current=false;setActive(false);setOffset(0);latest.current.onDragging(false);};
 useEffect(()=>()=>latest.current.onDragging(false),[]);
 useEffect(()=>{if(props.readOnly)reset();},[props.readOnly]);
 const pan=useRef(PanResponder.create({
  onMoveShouldSetPanResponderCapture:()=>armed.current&&!latest.current.readOnly,
  onMoveShouldSetPanResponder:()=>armed.current&&!latest.current.readOnly,
  onPanResponderGrant:()=>{claimed.current=true;},
  onPanResponderMove:(_,g)=>{if(!armed.current)return;const next=moveRange(origin.current.start,origin.current.end,g.dy/PX);range.current=next;setOffset((next.start-origin.current.start)*PX);},
  onPanResponderRelease:()=>{const moved=range.current;if(armed.current&&!latest.current.readOnly&&moved.start!==origin.current.start)latest.current.onMove(minuteLabel(moved.start),minuteLabel(moved.end));reset();},
  onPanResponderTerminate:reset,
  onPanResponderTerminationRequest:()=>!armed.current,
 })).current;
 const {entry,start,end,column,columns,dark,readOnly}=props;
 const blockHeight=Math.max(17,(end-start)*PX-2),compact=end-start<40;
 const titleLineHeight=compact?Math.min(16,blockHeight-4):16;
 const titleFontSize=Math.min(12,titleLineHeight-2);
 const titleLines=compact?Math.max(1,Math.floor((blockHeight-4)/titleLineHeight)):undefined;
 const accent=dark?darkColors.accent:'#315df5',edge=entry.appointmentId?'#b08ae9':accent,text=dark?darkColors.text:'#292e3b',muted=dark?darkColors.textMuted:'#778193';
 return <View {...pan.panHandlers} style={{position:'absolute',left:`${column/columns*100}%`,width:`${100/columns-1}%`,top:(props.displayTop??(start-GRID_START)*PX)+1+offset,height:blockHeight,zIndex:active?20:1,elevation:active?8:0}}><Pressable accessibilityRole="button" accessibilityLabel={`Bekijk ${entry.text}`} accessibilityHint={readOnly?undefined:'Houd ingedrukt en sleep om het tijdstip te verplaatsen'} accessibilityActions={readOnly?[]:[{name:'increment',label:'15 minuten later'},{name:'decrement',label:'15 minuten eerder'}]} onAccessibilityAction={e=>{if(readOnly)return;const moved=moveRange(diaryTime(entry.startTime!),diaryTime(entry.endTime!),e.nativeEvent.actionName==='increment'?15:-15);props.onMove(minuteLabel(moved.start),minuteLabel(moved.end));}} delayLongPress={450} onPressIn={()=>{suppress.current=false;}} onLongPress={()=>{if(readOnly)return;suppress.current=true;armed.current=true;origin.current={start:diaryTime(entry.startTime!),end:diaryTime(entry.endTime!)};range.current=origin.current;setActive(true);props.onDragging(true);}} onPressOut={()=>{setTimeout(()=>{if(armed.current&&!claimed.current)reset();},0);}} onPress={()=>{if(!suppress.current)props.onEdit();}} style={{flex:1,paddingLeft:7,paddingRight:!entry.done&&!readOnly?32:7,paddingVertical:compact?1:3,justifyContent:compact?'center':'flex-start',backgroundColor:dark?(entry.appointmentId?'#38314e':darkColors.accentSoft):(entry.appointmentId?'#f0eafa':'#e9f1ff'),borderRadius:6,borderLeftWidth:3,borderWidth:active?1:0,borderColor:edge,overflow:'hidden',opacity:active?.9:1,shadowColor:'#000',shadowOpacity:active?.2:0,shadowRadius:8}}><Text numberOfLines={titleLines} adjustsFontSizeToFit={compact} minimumFontScale={.65} ellipsizeMode="clip" maxFontSizeMultiplier={compact?1:undefined} style={{color:text,fontSize:titleFontSize,lineHeight:titleLineHeight,includeFontPadding:false,fontWeight:'600'}}>{entry.done?'✓ ':''}{entry.text}</Text>{end-start>=40&&<Text style={{color:muted,fontSize:10,lineHeight:14}}>{active?`${minuteLabel(range.current.start)}–${range.current.end===1440?'00:00':minuteLabel(range.current.end)}`:`${entry.startTime}–${entry.endTime==='24:00'?'00:00':entry.endTime}`}</Text>}</Pressable>{!entry.done&&!readOnly&&<Pressable accessibilityRole="button" accessibilityLabel={`Rond ${entry.text} af`} onPress={()=>props.onComplete()} style={{position:'absolute',right:0,top:0,bottom:0,width:30,alignItems:'center',justifyContent:'center'}}><Ionicons name="checkmark-circle-outline" size={compact?15:21} color={dark?darkColors.success:'#278450'}/></Pressable>}</View>;
}
