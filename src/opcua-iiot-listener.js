/*
 The BSD 3-Clause License

 Copyright 2016,2017,2018 - Klaus Landsdorf (http://bianco-royal.de/)
 Copyright 2015,2016 - Mika Karaila, Valmet Automation Inc. (node-red-contrib-opcua)
 All rights reserved.
 node-red-contrib-iiot-opcua
 */
'use strict'

/**
 * Listener Node-RED node.
 *
 * @param RED
 */
module.exports = function (RED) {
  // SOURCE-MAP-REQUIRED
  let coreListener = require('./core/opcua-iiot-core-listener')
  let Map = require('collections/map')
  const _ = require('underscore')

  function OPCUAIIoTListener (config) {
    RED.nodes.createNode(this, config)
    this.action = config.action
    this.queueSize = config.queueSize || 1
    this.name = config.name
    this.topic = config.topic
    this.justValue = config.justValue
    this.useGroupItems = config.useGroupItems
    this.showStatusActivities = config.showStatusActivities
    this.showErrors = config.showErrors
    this.connector = RED.nodes.getNode(config.connector)

    let node = this
    node.reconnectTimeout = 1000
    node.sessionTimeout = null
    node.opcuaClient = null
    node.opcuaSession = null
    node.subscriptionStarted = false

    let uaSubscription = null
    let StatusCodes = coreListener.core.nodeOPCUA.StatusCodes
    let AttributeIds = coreListener.core.nodeOPCUA.AttributeIds
    node.monitoredItems = new Map()
    node.monitoredASO = new Map()

    node.stateMachine = coreListener.createStatelyMachine()
    node.stateMachine.init()

    node.verboseLog = function (logMessage) {
      if (RED.settings.verbose) {
        coreListener.internalDebugLog(logMessage)
      }
    }

    node.statusLog = function (logMessage) {
      if (RED.settings.verbose && node.showStatusActivities) {
        node.verboseLog('Status: ' + logMessage)
      }
    }

    node.setNodeStatusTo = function (statusValue) {
      node.statusLog(statusValue)
      let statusParameter = coreListener.core.getNodeStatus(statusValue, node.showStatusActivities)
      node.status({fill: statusParameter.fill, shape: statusParameter.shape, text: statusParameter.status})
    }

    node.createSubscription = function (msg, cb) {
      let timeMilliseconds = (typeof msg.payload === 'number') ? msg.payload : null

      if (node.subscriptionStarting) {
        coreListener.internalDebugLog('monitoring subscription try to start twice')
      } else {
        node.subscriptionStarting = true
        uaSubscription = null
        let options = {}
        if (node.action !== 'events') {
          coreListener.internalDebugLog('create monitoring subscription')
          options = msg.payload.options || coreListener.getSubscriptionParameters(timeMilliseconds)
        } else {
          coreListener.internalDebugLog('create event subscription')
          options = msg.payload.options || coreListener.getEventSubscribtionParameters(timeMilliseconds)
        }
        node.makeSubscription(options, cb)
      }
    }

    node.resetSubscription = function () {
      node.subscriptionStarting = false
      node.sendAllMonitoredItems('SUBSCRIPTION TERMINATED')
    }

    node.sendAllMonitoredItems = function (payload) {
      let addressSpaceItems = []
      node.monitoredASO.forEach(function (value, key) {
        addressSpaceItems.push({name: '', nodeId: key, datatypeName: ''})
      })
      node.send({payload: payload, monitoredASO: node.monitoredASO, addressSpaceItems: addressSpaceItems})
      node.monitoredItems.clear()
      node.monitoredASO.clear()
    }

    node.subscribeActionInput = function (msg) {
      if (!uaSubscription) {
        node.createSubscription(msg, function () {
          node.subscribeMonitoredItem(msg)
        })
      } else {
        if (node.subscribingPreCheck()) {
          node.subscribeMonitoredItem(msg)
        } else {
          node.resetSubscription()
        }
      }
    }

    node.subscribeEventsInput = function (msg) {
      if (!uaSubscription) {
        node.createSubscription(msg, function () {
          node.subscribeMonitoredEvent(msg)
        })
      } else {
        if (node.subscribingPreCheck()) {
          node.subscribeMonitoredEvent(msg)
        } else {
          node.resetSubscription()
        }
      }
    }

    node.subscribingPreCheck = function () {
      if (typeof uaSubscription.subscriptionId === 'string') {
        coreListener.detailDebugLog('subscription not ready with ID: ' + uaSubscription.subscriptionId)
      }
      return uaSubscription && typeof uaSubscription.subscriptionId !== 'string'
    }

    node.updateSubscriptionStatus = function () {
      coreListener.internalDebugLog('listening' + ' (' + node.monitoredItems.size + ')')
      node.setNodeStatusTo('listening' + ' (' + node.monitoredItems.size + ')')
    }

    node.subscribeMonitoredItem = function (msg) {
      if (!node.subscriptionStarted) {
        node.error(new Error('Subscription Not Started To Monitor'), msg)
        return
      }

      if (msg.addressSpaceItems.length) {
        if (node.useGroupItems) {
          if (node.monitoredItemGroup && node.monitoredItemGroup.groupId !== null) {
            node.monitoredItemGroup.terminate(function (err) {
              if (err) {
                coreListener.internalDebugLog(err)
              }
              node.monitoredItemGroup.groupId = null
            })
          } else {
            coreListener.buildNewMonitoredItemGroup(node, msg, msg.addressSpaceItems, uaSubscription)
              .then(function (result) {
                if (!result.monitoredItemGroup) {
                  node.error(new Error('No Monitored Item Group In Result Of NodeOPCUA'))
                } else {
                  result.monitoredItemGroup.groupId = _.uniqueId('group_')
                  node.monitoredItemGroup = result.monitoredItemGroup
                }
              }).catch(function (err) {
                coreListener.subscribeDebugLog(err)
                if (node.showErrors) {
                  node.error(err, msg)
                }
              })
          }
        } else {
          let itemsToMonitor = msg.addressSpaceItems.filter(addressSpaceItem => {
            let nodeIdToMonitor = (typeof addressSpaceItem.nodeId === 'string') ? addressSpaceItem.nodeId : addressSpaceItem.nodeId.toString()
            return node.monitoredASO.get(nodeIdToMonitor) === undefined
          })

          let itemsToTerminate = msg.addressSpaceItems.filter(addressSpaceItem => {
            let nodeIdToMonitor = (typeof addressSpaceItem.nodeId === 'string') ? addressSpaceItem.nodeId : addressSpaceItem.nodeId.toString()
            return node.monitoredASO.get(nodeIdToMonitor) !== undefined
          })

          if (itemsToMonitor.length) {
            msg.addressSpaceItems = itemsToMonitor
            coreListener.monitorItems(node, msg, uaSubscription)
          }

          if (itemsToTerminate.length) {
            let nodeIdToMonitor
            let monitoredItem
            itemsToTerminate.forEach(addressSpaceItem => {
              nodeIdToMonitor = (typeof addressSpaceItem.nodeId === 'string') ? addressSpaceItem.nodeId : addressSpaceItem.nodeId.toString()
              monitoredItem = node.monitoredASO.get(nodeIdToMonitor)
              coreListener.subscribeDebugLog('Monitored Item Unsubscribe ' + nodeIdToMonitor)
              monitoredItem.terminate(function (err) {
                node.monitoredItemTerminated(msg, monitoredItem, nodeIdToMonitor, err)
              })
            })
          }
        }
      }
    }

    node.subscribeMonitoredEvent = function (msg) {
      if (!node.subscriptionStarted) {
        node.error(new Error('Subscription Not Started To Monitor'), msg)
        return
      }

      for (let addressSpaceItem of msg.addressSpaceItems) {
        if (!addressSpaceItem.nodeId) {
          coreListener.eventDebugLog('Address Space Item Not Valid to Monitor Event Of ' + addressSpaceItem)
          return
        }

        if (addressSpaceItem.datatypeName === 'ns=0;i=0') {
          coreListener.subscribeDebugLog('Address Space Item Not Allowed to Monitor ' + addressSpaceItem)
          return
        }

        let nodeIdToMonitor
        if (typeof addressSpaceItem.nodeId === 'string') {
          nodeIdToMonitor = addressSpaceItem.nodeId
        } else {
          nodeIdToMonitor = addressSpaceItem.nodeId.toString()
        }

        let monitoredItem = node.monitoredASO.get(nodeIdToMonitor)

        if (!monitoredItem) {
          coreListener.eventDebugLog('Regsiter Event Item ' + nodeIdToMonitor)
          coreListener.buildNewEventItem(nodeIdToMonitor, msg, uaSubscription)
            .then(function (result) {
              coreListener.eventDebugLog('Event Item Regsitered ' + result.monitoredItem.monitoredItemId + ' to ' + result.nodeId)
              node.monitoredASO.set(result.nodeId.toString(), result.monitoredItem)
            }).catch(function (err) {
              coreListener.eventDebugLog(err)
              if (node.showErrors) {
                node.error(err, msg)
              }
            })
        } else {
          coreListener.subscribeDebugLog('Terminate Event Item' + nodeIdToMonitor)
          monitoredItem.terminate(function (err) {
            node.monitoredItemTerminated(msg, monitoredItem, nodeIdToMonitor, err)
          })
        }
      }
    }

    node.monitoredItemTerminated = function (msg, monitoredItem, nodeId, err) {
      if (err) {
        coreListener.internalDebugLog(err + ' on ' + monitoredItem.monitoredItemId)
        if (node.showErrors) {
          node.error(err, msg)
        }
      }
      node.updateMonitoredItemLists(monitoredItem, nodeId)
    }

    node.updateMonitoredItemLists = function (monitoredItem, nodeId) {
      if (monitoredItem && monitoredItem.itemToMonitor) {
        if (node.monitoredItems.has(monitoredItem.monitoredItemId)) {
          node.monitoredItems.delete(monitoredItem.monitoredItemId)
        }

        if (coreListener.core.isNodeId(monitoredItem.itemToMonitor.nodeId)) {
          coreListener.internalDebugLog('Terminate Monitored Item ' + monitoredItem.itemToMonitor.nodeId)
          if (node.monitoredASO.has(nodeId)) {
            node.monitoredASO.delete(nodeId)
          }
        } else {
          coreListener.internalDebugLog('monitoredItem NodeId is not valid Id:' + monitoredItem.monitoredItemId)
          node.monitoredASO.forEach(function (value, key, map) {
            coreListener.internalDebugLog('monitoredItem removing from ASO list key:' + key + ' value ' + value.monitoredItemId)
            if (value.monitoredItemId && value.monitoredItemId === monitoredItem.monitoredItemId) {
              coreListener.internalDebugLog('monitoredItem removed from ASO list' + key)
              map.delete(key)
            }
          })
        }

        node.updateSubscriptionStatus()
      }
    }

    node.setMonitoring = function (monitoredItem) {
      if (!coreListener.core.isNodeId(monitoredItem.itemToMonitor.nodeId)) {
        coreListener.internalDebugLog('monitoredItem NodeId is not valid Id:' + monitoredItem.monitoredItemId)
      }

      coreListener.internalDebugLog('add monitoredItem to list')
      node.monitoredItems.set(monitoredItem.monitoredItemId, monitoredItem)

      monitoredItem.on('changed', function (dataValue) {
        if (!monitoredItem.monitoringParameters.filter) {
          node.sendDataFromMonitoredItem(monitoredItem, dataValue)
        } else {
          node.sendDataFromEvent(monitoredItem, dataValue)
        }
      })

      monitoredItem.on('error', function (err) {
        coreListener.internalDebugLog(err + ' on ' + monitoredItem.monitoredItemId)
        if (node.showErrors) {
          node.error(err, {payload: 'Monitored Item Error', monitoredItem: monitoredItem})
        }

        node.updateMonitoredItemLists(monitoredItem, monitoredItem.itemToMonitor.nodeId)

        if (node.connector && err.message && err.message.includes('BadSession')) {
          node.sendAllMonitoredItems('BAD SESSION')
          node.connector.resetBadSession()
        }
      })

      monitoredItem.on('terminated', function () {
        coreListener.internalDebugLog('Terminated For ' + monitoredItem.monitoredItemId)
        node.updateMonitoredItemLists(monitoredItem, monitoredItem.itemToMonitor.nodeId)
      })
    }

    node.sendDataFromMonitoredItem = function (monitoredItem, dataValue) {
      let msg = {
        payload: {},
        topic: node.topic,
        addressSpaceItems: [{name: '', nodeId: (coreListener.core.isNodeId(monitoredItem.itemToMonitor.nodeId)) ? monitoredItem.itemToMonitor.nodeId.toString() : 'invalid', datatypeName: ''}],
        nodetype: 'listen',
        injectType: 'subscribe'
      }

      let dataValuesString = {}
      if (node.justValue) {
        dataValuesString = JSON.stringify(dataValue, null, 2)
        try {
          RED.util.setMessageProperty(msg, 'payload', JSON.parse(dataValuesString))
        } catch (err) {
          if (node.showErrors) {
            node.warn('JSON not to parse from string for monitored item')
            node.error(err, msg)
          }

          msg.payload = dataValuesString
          msg.error = err.message
        }
      } else {
        msg.payload = { dataValue: dataValue, monitoredItem: monitoredItem }
      }

      coreListener.detailDebugLog('sendDataFromMonitoredItem: ' + msg)
      node.send(msg)
    }

    node.sendDataFromEvent = function (monitoredItem, dataValue) {
      let msg = {
        payload: {},
        topic: node.topic,
        addressSpaceItems: [{name: '', nodeId: (coreListener.core.isNodeId(monitoredItem.itemToMonitor.nodeId)) ? monitoredItem.itemToMonitor.nodeId.toString() : 'invalid', datatypeName: ''}],
        nodetype: 'listen',
        injectType: 'event'
      }

      coreListener.analyzeEvent(node.opcuaSession, node.getBrowseName, dataValue)
        .then(function (eventResults) {
          coreListener.eventDetailDebugLog('Monitored Event Results ' + eventResults)

          let dataValuesString = {}
          if (node.justValue) {
            dataValuesString = JSON.stringify({ dataValue: dataValue }, null, 2)
            try {
              RED.util.setMessageProperty(msg, 'payload', JSON.parse(dataValuesString))
            } catch (err) {
              if (node.showErrors) {
                node.warn('JSON not to parse from string for monitored item')
                node.error(err, msg)
              }

              msg.payload = dataValuesString
              msg.error = err.message
            }
          } else {
            msg.payload = { dataValue: dataValue, eventResults: eventResults, monitoredItem: monitoredItem }
          }

          coreListener.detailDebugLog('sendDataFromEvent: ' + msg)
          node.send(msg)
        }).catch(function (err) {
          node.errorHandling(err)
        })
    }

    node.errorHandling = function (err) {
      coreListener.internalDebugLog(err)
      if (node.showErrors) {
        node.error(err, {payload: 'Error Handling'})
      }

      if (err) {
        if (coreListener.core.isSessionBad(err)) {
          node.sendAllMonitoredItems('BAD SESSION')
          if (node.connector) {
            node.connector.resetBadSession()
          }
        }
      }
    }

    node.makeSubscription = function (parameters, callback) {
      if (!node.opcuaSession) {
        coreListener.internalDebugLog('Subscription Session Not Valid')
        return
      }

      if (!parameters) {
        coreListener.internalDebugLog('Subscription Parameters Not Valid')
        return
      } else {
        coreListener.internalDebugLog('Subscription Parameters: ' + JSON.stringify(parameters))
      }

      uaSubscription = new coreListener.core.nodeOPCUA.ClientSubscription(node.opcuaSession, parameters)
      coreListener.internalDebugLog('New Subscription Created')

      uaSubscription.on('initialized', function () {
        coreListener.internalDebugLog('Subscription initialized')
        node.subscriptionStarting = true
        node.setNodeStatusTo('initialized')
        node.stateMachine.init()
      })

      uaSubscription.on('started', function () {
        coreListener.internalDebugLog('Subscription started')
        node.setNodeStatusTo('started')
        node.monitoredItems.clear()
        node.subscriptionStarting = false
        node.subscriptionStarted = true
        node.stateMachine.start()
        callback()
      })

      uaSubscription.on('terminated', function () {
        coreListener.internalDebugLog('Subscription terminated')
        node.subscriptionStarting = false
        node.subscriptionStarted = false
        node.setNodeStatusTo('terminated')
        node.stateMachine.terminate()
        node.resetSubscription()
      })

      uaSubscription.on('internal_error', function (err) {
        node.subscriptionStarted = false
        coreListener.internalDebugLog(err)
        if (node.showErrors) {
          node.error(err, {payload: 'Internal Error'})
        }
        node.setNodeStatusTo('error')
        node.stateMachine.error()
        node.resetSubscription()
      })

      uaSubscription.on('item_added', function (monitoredItem) {
        node.setMonitoring(monitoredItem)
        node.updateSubscriptionStatus()
      })
    }

    node.getBrowseName = function (session, nodeId, callback) {
      coreListener.client.read(session, [{
        nodeId: nodeId,
        attributeId: AttributeIds.BrowseName
      }], function (err, org, readValue) {
        if (!err) {
          if (readValue[0].statusCode === StatusCodes.Good) {
            let browseName = readValue[0].value.value.name
            return callback(null, browseName)
          }
        }
        callback(err, 'Unknown')
      })
    }

    node.on('input', function (msg) {
      if (msg.nodetype === 'browse') { /* browse is just to address listening to many nodes */
        msg.nodetype = 'inject'
        msg.injectType = 'listen'
        msg.addressSpaceItems = coreListener.core.buildNodesToListen(msg)
      }

      if (!msg.addressSpaceItems || !msg.addressSpaceItems.length) {
        coreListener.subscribeDebugLog('Address-Space-Item Set Not Valid')
        if (node.showErrors) {
          node.error(new Error('Address-Space-Item Set Not Valid'), msg)
        }
        return
      }

      // start here to check connection to get unit-tests working while there is no mocking
      // TODO: Connector mocking
      if (node.connector && node.connector.stateMachine.getMachineState() !== 'OPEN') {
        coreListener.internalDebugLog('Wrong Client State ' + node.connector.stateMachine.getMachineState() + ' On Browse')
        if (node.showErrors) {
          node.error(new Error('Client Not Open On Browse'), msg)
        }
        return
      }

      if (!node.opcuaSession) {
        coreListener.internalDebugLog('Session Not Ready To Listen')
        if (node.showErrors) {
          node.error(new Error('Session Not Ready To Listen'), msg)
        }
        return
      }

      switch (node.action) {
        case 'subscribe':
          node.subscribeActionInput(msg)
          break
        case 'events':
          node.subscribeEventsInput(msg)
          break
        default:
          node.error(new Error('Type Of Action To Listener Is Not Valid'), msg)
      }
    })

    node.setOPCUAConnected = function (opcuaClient) {
      node.opcuaClient = opcuaClient
      node.setNodeStatusTo('connected')
    }

    node.opcuaSessionStarted = function (opcuaSession) {
      node.opcuaSession = opcuaSession
      node.setNodeStatusTo('active')
    }

    node.opcuaSessionClosed = function (opcuaSession) {
      node.opcuaSession = null
      node.setNodeStatusTo('closed')
    }

    node.connectorShutdown = function (opcuaClient) {
      coreListener.internalDebugLog('Connector Shutdown')
      if (opcuaClient) {
        node.opcuaClient = opcuaClient
      }
    }

    if (node.connector) {
      node.connector.on('connected', node.setOPCUAConnected)
      node.connector.on('session_started', node.opcuaSessionStarted)
      node.connector.on('session_closed', node.opcuaSessionClosed)
      node.connector.on('after_reconnection', node.connectorShutdown)

      coreListener.core.setNodeInitalState(node.connector.stateMachine.getMachineState(), node)
    } else {
      node.error(new Error('Connector Not Valid'), {payload: 'No connector configured'})
    }

    node.on('close', function (done) {
      if (uaSubscription !== null && node.stateMachine.getMachineState() !== 'TERMINATED') {
        uaSubscription.terminate(done)
        uaSubscription = null
      } else {
        done()
      }
    })
  }

  RED.nodes.registerType('OPCUA-IIoT-Listener', OPCUAIIoTListener)
}
