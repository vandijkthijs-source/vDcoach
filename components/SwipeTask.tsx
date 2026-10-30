import React,{useEffect,useRef,useState} from 'react';
import {Animated,PanResponder,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {darkColors} from '../constants/theme';
type Props={children:React.ReactNode;dark:boolean;disabled:boolean;title:string;onTomorrow:()=>void;onDelete:()=>void;onDragging:(active:boolean)=>void};
export default function SwipeTask(props:Props){
 const latest=useRef(props);latest.current=props;
 const x=useRef(new Animated.Value(0)).current;
 const [direction,setDirection]=useState(0);
 const reset=()=>{latest.current.onDragging(false);Animated.spring(x,{toValue:0,useNativeDriver:false,tension:180,friction:24}).start(()=>setDirection(0));};
 useEffect(()=>()=>latest.current.onDragging(false),[]);
 const pan=useRef(PanResponder.create({
  onMoveShouldSetPanResponderCapture:(_,g)=>!latest.current.disabled&&Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.5,
  onMoveShouldSetPanResponder:(_,g)=>!latest.current.disabled&&Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.5,
  onPanResponderGrant:()=>latest.current.onDragging(true),
  onPanResponderMove:(_,g)=>{x.setValue(Math.max(-150,Math.min(150,g.dx)));setDirection(g.dx>0?1:-1);},
  onPanResponderRelease:(_,g)=>{if(!latest.current.disabled&&Math.abs(g.dx)>=90){latest.current.onDragging(false);if(g.dx>0)latest.current.onTomorrow();else latest.current.onDelete();}reset();},
  onPanResponderTerminate:reset,
  onPanResponderTerminationRequest:()=>false,
 })).current;
 return <View style={{overflow:'hidden',borderRadius:8}} accessible={false}>
 {direction!==0&&<View pointerEvents="none" style={{position:'absolute',top:0,bottom:0,left:0,right:0,paddingHorizontal:15,justifyContent:'center',alignItems:direction>0?'flex-start':'flex-end',backgroundColor:direction>0?(props.dark?darkColors.accentSoft:'#e6efff'):(props.dark?'#4b2933':'#fbe8ec')}}><View style={{alignItems:'center',gap:3}}><Ionicons name={direction>0?'calendar-outline':'trash-outline'} size={20} color={direction>0?(props.dark?darkColors.accent:'#315df5'):(props.dark?darkColors.danger:'#b33452')}/><Text style={{fontSize:11,color:props.dark?darkColors.text:'#292e3b'}}>{direction>0?'Morgen':'Verwijderen'}</Text></View></View>}
 <Animated.View {...pan.panHandlers} accessibilityActions={props.disabled?[]:[{name:'tomorrow',label:'Verplaats naar morgen'},{name:'delete',label:'Verwijder taak'}]} onAccessibilityAction={e=>{if(props.disabled)return;if(e.nativeEvent.actionName==='tomorrow')props.onTomorrow();if(e.nativeEvent.actionName==='delete')props.onDelete();}} style={{backgroundColor:props.dark?darkColors.background:'#f7f8fb',transform:[{translateX:x}]}}>{props.children}</Animated.View>
 </View>;
}
