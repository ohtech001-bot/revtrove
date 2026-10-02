import test from 'node:test'
import assert from 'node:assert/strict'
import {createOrderRepository,orderFilterGroups} from '../server/src/repositories/orderRepository.js'
test('Order filters distinguish ready-to-work from prepared and include archived received orders',async()=>{
 assert.ok(orderFilterGroups.unprepared.includes('ready'));assert.deepEqual(orderFilterGroups.prepared,['awaiting_pickup']);assert.deepEqual(orderFilterGroups.received,['archived','completed'])
 for(const [status,expected] of Object.entries(orderFilterGroups)){let observed;const query={where:(key,operator,values)=>{observed={key,operator,values};return query},orderBy:()=>query,limit:()=>query,get:async()=>({docs:[],size:0})};await createOrderRepository({collection:()=>query}).list({status});assert.deepEqual(observed,{key:'status',operator:'in',values:expected})}
})
