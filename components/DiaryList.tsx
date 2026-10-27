import React,{useEffect,useRef,useState} from 'react';
import {Animated,PanResponder,Pressable,StyleSheet,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {DiaryEntry,moveDiaryEntry} from '../lib/model';
const MIN_HEIGHT=56,GAP=0;
type Props={entries:DiaryEntry[];dark:boolean;disabled:boolean;onReorder:(entries:DiaryEntry[])=>void;onToggle:(id:string)=>void;onRemove:(id:string)=>void;onDragging:(value:boolean)=>void};
export default function DiaryList(props:Props){
 const latest=useRef(props);latest.current=props;
 const positions=useRef(new Map<string,Animated.Value>()),responders=useRef(new Map<string,ReturnType<typeof PanResponder.create>>());
 const heights=useRef(new Map<string,number>());
 const [layoutVersion,setLayoutVersion]=useState(0);
 const active=useRef<{id:string;from:number;to:number;entries:DiaryEntry[];top:number;height:number;total:number}|null>(null);
 function layout(entries:DiaryEntry[]){let top=0;return entries.map(entry=>{const height=heights.current.get(entry.id)??MIN_HEIGHT;const row={id:entry.id,top,height};top+=height+GAP;return row;});}
 const [dragging,setDragging]=useState<string|null>(null);
 function value(id:string,index:number){if(!positions.current.has(id))positions.current.set(id,new Animated.Value(layout(latest.current.entries)[index]?.top??0));return positions.current.get(id)!;}
 function settle(entries:DiaryEntry[]){const rows=layout(entries);entries.forEach((e,i)=>Animated.spring(value(e.id,i),{toValue:rows[i].top,useNativeDriver:false,tension:190,friction:24}).start());}
 useEffect(()=>{if(!active.current)settle(props.entries);},[props.entries,layoutVersion]);
 useEffect(()=>()=>{latest.current.onDragging(false);},[]);
 function responder(id:string){if(!responders.current.has(id))responders.current.set(id,PanResponder.create({
  onStartShouldSetPanResponder:()=>!latest.current.disabled,
  onMoveShouldSetPanResponder:()=>!latest.current.disabled,
  onPanResponderGrant:()=>{const entries=[...latest.current.entries],from=entries.findIndex(e=>e.id===id);if(from<0)return;const rows=layout(entries),row=rows[from],last=rows[rows.length-1];active.current={id,from,to:from,entries,top:row.top,height:row.height,total:last.top+last.height};setDragging(id);latest.current.onDragging(true);value(id,from).stopAnimation();},
  onPanResponderMove:(_,g)=>{const a=active.current;if(!a)return;const y=Math.max(0,Math.min(a.total-a.height,a.top+g.dy));value(id,a.from).setValue(y);const remaining=a.entries.filter(e=>e.id!==id);const to=layout(remaining).filter(row=>y>row.top+row.height/2).length;if(to!==a.to){a.to=to;const order=moveDiaryEntry(a.entries,id,to),rows=layout(order);order.forEach((e,i)=>{if(e.id!==id)Animated.spring(value(e.id,i),{toValue:rows[i].top,useNativeDriver:false,tension:190,friction:24}).start();});}},
  onPanResponderRelease:()=>{const a=active.current;if(!a)return;const entries=moveDiaryEntry(a.entries,id,a.to);active.current=null;setDragging(null);latest.current.onDragging(false);settle(entries);latest.current.onReorder(entries);},
  onPanResponderTerminate:()=>{active.current=null;setDragging(null);latest.current.onDragging(false);settle(latest.current.entries);},
  onPanResponderTerminationRequest:()=>false,
 }));return responders.current.get(id)!;}
 const fg=props.dark?'#e5e9f2':'#292e3b',muted=props.dark?'#a4aec0':'#778193',accent=props.dark?'#8ba5ff':'#315df5';
 const rows=layout(props.entries),last=rows[rows.length-1];
 return <View style={{height:last?last.top+last.height+GAP:0,position:'relative'}}>{props.entries.map((entry,i)=><Animated.View key={entry.id} onLayout={event=>{const height=Math.ceil(event.nativeEvent.layout.height);if(height>0&&heights.current.get(entry.id)!==height){heights.current.set(entry.id,height);setLayoutVersion(v=>v+1);}}} style={[s.item,{transform:[{translateY:value(entry.id,i)}],backgroundColor:dragging===entry.id?(props.dark?'#191e27':'#fff'):'transparent',borderRadius:dragging===entry.id?8:0,borderColor:dragging===entry.id?accent:props.dark?'#252d3a':'#e5e9f1',zIndex:dragging===entry.id?10:1,elevation:dragging===entry.id?8:0,shadowOpacity:dragging===entry.id?.15:0}]}>
 <Pressable accessibilityRole="checkbox" accessibilityLabel={`Gedaan: ${entry.text}`} accessibilityState={{checked:entry.done,disabled:props.disabled}} disabled={props.disabled} onPress={()=>props.onToggle(entry.id)} style={s.check}><Ionicons name={entry.done?'checkbox':'square-outline'} size={20} color={entry.done?accent:muted}/></Pressable>
 <View style={{flex:1,minWidth:0}}><Text style={{fontSize:14,lineHeight:20,color:fg}}>{entry.text}</Text>{(entry.appointmentId||entry.note)&&<Text style={{fontSize:11,lineHeight:16,color:muted}}>{[entry.appointmentId?entry.time??'Afspraak':null,entry.appointmentId&&!entry.done?'gepland':null,entry.note].filter(Boolean).join(' · ')}</Text>}</View>
 {!props.disabled&&<Pressable accessibilityRole="button" accessibilityLabel={`Verwijder ${entry.text}`} onPress={()=>props.onRemove(entry.id)} style={s.remove}><Ionicons name="close-outline" size={16} color={muted}/></Pressable>}
 <View {...responder(entry.id).panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`Verplaats ${entry.text}`} accessibilityHint="Sleep omhoog of omlaag om de volgorde te wijzigen" accessibilityActions={[{name:'increment',label:'Eén plaats omlaag'},{name:'decrement',label:'Eén plaats omhoog'}]} onAccessibilityAction={e=>{if(props.disabled)return;props.onReorder(moveDiaryEntry(props.entries,entry.id,i+(e.nativeEvent.actionName==='increment'?1:-1)));}} style={[s.handle,props.disabled&&{opacity:.25}]}><Ionicons name="reorder-three-outline" size={22} color={muted}/></View>
 </Animated.View>)}</View>;
}
const s=StyleSheet.create({item:{position:'absolute',left:0,right:0,top:0,minHeight:56,paddingVertical:8,borderBottomWidth:1,flexDirection:'row',alignItems:'center',gap:6,paddingLeft:0,paddingRight:0,shadowColor:'#000',shadowRadius:8,shadowOffset:{width:0,height:3}},check:{width:32,minHeight:40,alignItems:'center',justifyContent:'center'},remove:{width:30,minHeight:40,alignItems:'center',justifyContent:'center'},handle:{width:36,minHeight:40,alignSelf:'stretch',justifyContent:'center',alignItems:'center',touchAction:'none'} as any});
