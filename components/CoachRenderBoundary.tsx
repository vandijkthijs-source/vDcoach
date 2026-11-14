import React from 'react';
import {Pressable,Text,View} from 'react-native';
/** An illustration failure must not take the conversation or stored day down with it. */
export default class CoachRenderBoundary extends React.Component<{dark:boolean;children:React.ReactNode;onRecover?:()=>void},{failed:boolean;code:string}>{
 state={failed:false,code:''};
 static getDerivedStateFromError(error:Error){return{failed:true,code:/Text strings/.test(error.message)?'CHAT_TEXT_LAYOUT':'CHAT_RENDER'}}
 render(){return this.state.failed?<View style={{width:280,height:120,alignItems:'center',justifyContent:'center'}}><View style={{width:8,height:8,borderRadius:4,backgroundColor:this.props.dark?'#b7cbd1':'#6d929f'}}/><Text style={{marginTop:12,fontSize:11,color:this.props.dark?'#aeb9c8':'#738096'}}>{this.props.onRecover?'Coach tijdelijk niet beschikbaar':'Animatie tijdelijk niet beschikbaar'}</Text><Text selectable style={{marginTop:4,fontSize:10,color:this.props.dark?'#7f8c9c':'#738096'}}>Foutcode: {this.state.code}</Text>{this.props.onRecover&&<Pressable accessibilityRole="button" accessibilityLabel="Dagoverzicht openen" onPress={this.props.onRecover} style={{padding:12}}><Text style={{color:this.props.dark?'#b7cbd1':'#6d929f'}}>Dagoverzicht openen</Text></Pressable>}</View>:this.props.children}
}
