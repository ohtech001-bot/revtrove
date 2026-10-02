import test from 'node:test'
import assert from 'node:assert/strict'
import {archiveRetention,ordersFilterStatus} from '../client/src/lib/archive-retention.js'
test('Order filters exclude archive even for All and Received',()=>{
 assert.equal(ordersFilterStatus('orders','all'),'all')
 assert.equal(ordersFilterStatus('orders','received'),'completed')
 assert.equal(ordersFilterStatus('archive','all'),'archived')
})
test('Archive countdown uses the same 60-day deadline as server cleanup',()=>{
 const start=Date.parse('2026-10-03T10:00:00Z'),day=86400000
 assert.equal(archiveRetention({archived_at:new Date(start).toISOString()},start).remainingDays,60)
 assert.equal(archiveRetention({archived_at:new Date(start).toISOString()},start+day).remainingDays,59)
 assert.equal(archiveRetention({archived_at:new Date(start).toISOString()},start+59.5*day).remainingDays,1)
 assert.equal(archiveRetention({archived_at:new Date(start).toISOString()},start+61*day).remainingDays,0)
 assert.equal(archiveRetention({updated_at:new Date(start).toISOString()},start).remainingDays,60)
 assert.equal(archiveRetention({archived_at:'invalid'},start),null)
})
