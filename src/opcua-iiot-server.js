/*
 The BSD 3-Clause License

 Copyright 2016,2017 - Klaus Landsdorf (http://bianco-royal.de/)
 Copyright 2015,2016 - Mika Karaila, Valmet Automation Inc. (node-red-contrib-opcua)
 All rights reserved.
 node-red-iiot-opcua
 */
'use strict'

/**
 * Server Node-RED node.
 *
 * @param RED
 */
module.exports = function (RED) {
  let coreServer = require('./core/opcua-iiot-core-server')
  let path = require('path')
  let os = require('os')
  let Map = require('collections/map')
  let xmlFiles = [path.join(__dirname, 'public/vendor/opc-foundation/xml/Opc.Ua.NodeSet2.xml')]
  let LocalizedText = require('node-opcua/lib/datamodel/localized_text').LocalizedText

  function OPCUAIIoTServer (config) {
    let initialized = false
    let server = null
    let addressSpaceMessages = new Map()

    RED.nodes.createNode(this, config)
    this.port = config.port
    this.endpoint = config.endpoint
    this.maxAllowedSessionNumber = parseInt(config.maxAllowedSessionNumber) || 10
    this.maxConnectionsPerEndpoint = parseInt(config.maxConnectionsPerEndpoint) || 10
    this.maxAllowedSubscriptionNumber = parseInt(config.maxAllowedSubscriptionNumber) || 50
    this.alternateHostname = config.alternateHostname
    this.name = config.name
    this.showStatusActivities = config.showStatusActivities
    this.showErrors = config.showErrors
    // Security
    this.allowAnonymous = config.allowAnonymous
    // User Management
    this.users = config.users

    let node = this
    coreServer.core.nodeOPCUA.OPCUAServer.MAX_SUBSCRIPTION = node.maxAllowedSubscriptionNumber
    let geFullyQualifiedDomainName = coreServer.core.nodeOPCUA.get_fully_qualified_domain_name
    let makeApplicationUrn = coreServer.core.nodeOPCUA.makeApplicationUrn

    node.publicCertificate = path.join(__dirname, '../node_modules/node-opcua/certificates/server_selfsigned_cert_2048.pem')
    node.privateCertificate = path.join(__dirname, '../node_modules/node-opcua/certificates/server_key_2048.pem')

    setNodeStatusTo('waiting')

    function setNodeStatusTo (statusValue) {
      let statusParameter = coreServer.core.getNodeStatus(statusValue)
      node.status({fill: statusParameter.fill, shape: statusParameter.shape, text: statusParameter.status})
    }

    coreServer.internalDebugLog('node set:' + xmlFiles.toString())

    function initNewServer () {
      initialized = false

      coreServer.name = 'NodeREDIIOTServer'

      server = new coreServer.core.nodeOPCUA.OPCUAServer({
        port: node.port,
        nodeset_filename: xmlFiles,
        resourcePath: node.endpoint || 'UA/NodeREDIIOTServer',
        buildInfo: {
          productName: node.name.concat(' IIoT Server'),
          buildNumber: '160417',
          buildDate: new Date(2017, 4, 16)
        },
        serverCapabilities: {
          operationLimits: {
            maxNodesPerRead: 1000,
            maxNodesPerBrowse: 2000
          }
        },
        serverInfo: {
          applicationUri: makeApplicationUrn(geFullyQualifiedDomainName(), 'NodeRED-IIoT-Server'),
          productUri: 'NodeRED-IIoT-Server',
          applicationName: {text: 'NodeRED', locale: 'en'},
          gatewayServerUri: null,
          discoveryProfileUri: null,
          discoveryUrls: []
        },
        maxAllowedSessionNumber: node.maxAllowedSessionNumber,
        maxConnectionsPerEndpoint: node.maxConnectionsPerEndpoint,
        allowAnonymous: node.allowAnonymous,
        certificateFile: node.publicCertificate,
        privateKeyFile: node.privateCertificate,
        securityPolicies: [coreServer.core.nodeOPCUA.SecurityPolicy.None,
          coreServer.core.nodeOPCUA.SecurityPolicy.Basic128,
          coreServer.core.nodeOPCUA.SecurityPolicy.Basic128Rsa15,
          coreServer.core.nodeOPCUA.SecurityPolicy.Basic192,
          coreServer.core.nodeOPCUA.SecurityPolicy.Basic192Rsa15,
          coreServer.core.nodeOPCUA.SecurityPolicy.Basic256,
          coreServer.core.nodeOPCUA.SecurityPolicy.Basic256Rsa15,
          coreServer.core.nodeOPCUA.SecurityPolicy.Basic256Sha256],
        securityModes: [coreServer.core.nodeOPCUA.MessageSecurityMode.NONE,
          coreServer.core.nodeOPCUA.MessageSecurityMode.SIGN,
          coreServer.core.nodeOPCUA.MessageSecurityMode.SIGNANDENCRYPT],
        alternateHostname: node.alternateHostname,
        userManager: {
          isValidUser: node.isValidServerUser
        },
        isAuditing: false
      })

      server.initialize(postInitialize)

      let hostname = os.hostname()

      if (hostname) {
        let discoveryEndpointUrl = 'opc.tcp://' + hostname + ':4840/UADiscovery'
        coreServer.internalDebugLog('registering server to :' + discoveryEndpointUrl)

        server.registerServer(discoveryEndpointUrl, function (err) {
          if (err) {
            coreServer.internalDebugLog('Register Server Error' + err)
          } else {
            coreServer.internalDebugLog('Discovery Setup Done')
          }
        })
      }

      server.on('newChannel', function (channel) {
        coreServer.internalDebugLog('Client connected with address = '.bgYellow, channel.remoteAddress, ' port = ', channel.remotePort)
      })

      server.on('closeChannel', function (channel) {
        coreServer.internalDebugLog('Client disconnected with address = '.bgCyan, channel.remoteAddress, ' port = ', channel.remotePort)
      })
    }

    node.isValidServerUser = function (userName, password) {
      coreServer.internalDebugLog('Is Valid Server User?')

      node.users.forEach(function (user, index, array) {
        if (userName === user.name && password === user.password) {
          coreServer.internalDebugLog('Valid Server User Found')
          return true
        }
      })
      return false
    }

    function postInitialize () {
      initialized = true

      if (server) {
        coreServer.constructAddressSpace(server)

        server.start(function (err) {
          if (err) {
            coreServer.internalDebugLog('Start Error ' + err)
          } else {
            server.endpoints.forEach(function (endpoint) {
              endpoint.endpointDescriptions().forEach(function (endpointDescription) {
                coreServer.internalDebugLog('Server endpointUrl: ' +
                  endpointDescription.endpointUrl + ' securityMode: ' +
                  endpointDescription.securityMode.toString() +
                  ' securityPolicyUri: ' + endpointDescription.securityPolicyUri.toString())
              })
            })

            let endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl
            coreServer.internalDebugLog('Primary Server Endpoint URL ' + endpointUrl)

            setNodeStatusTo('active')

            server.on('newChannel', function (channel) {
              coreServer.internalDebugLog('Client connected with address = ' +
                channel.remoteAddress + ' port = ' + channel.remotePort
              )
            })

            server.on('closeChannel', function (channel) {
              coreServer.internalDebugLog('Client disconnected with address = ' +
                channel.remoteAddress + ' port = ' + channel.remotePort
              )
            })

            server.on('create_session', function (session) {
              coreServer.internalDebugLog(' SESSION CREATED')
              coreServer.internalDebugLog('Client application URI:' + session.clientDescription.applicationUri)
              coreServer.internalDebugLog('Client product URI:' + session.clientDescription.productUri)
              coreServer.internalDebugLog('Client application name:' + session.clientDescription.applicationName.toString())
              coreServer.internalDebugLog('Client application type:' + session.clientDescription.applicationType.toString())
              coreServer.internalDebugLog('Session name:' + session.sessionName ? session.sessionName.toString() : '<null>')
              coreServer.internalDebugLog('Session timeout:' + session.sessionTimeout)
              coreServer.internalDebugLog('Session id:' + session.sessionId)
            })

            server.on('session_closed', function (session, reason) {
              coreServer.internalDebugLog('SESSION CLOSED')
              coreServer.internalDebugLog('reason:' + reason)
              coreServer.internalDebugLog('Session name:' + session.sessionName ? session.sessionName.toString() : '<null>')
            })

            coreServer.internalDebugLog('Server Initialized')
          }
        })
      } else {
        coreServer.internalDebugLog('Server Is Not Valid')
      }
    }

    initNewServer()

    node.on('input', function (msg) {
      if (server === undefined || !initialized) {
        return false
      }

      addressSpaceMessages.clear()

      switch (msg.nodetype) {
        case 'ASO':
          changeAddressSpace(msg)
          break

        case 'CMD':
          executeOpcuaCommand(msg)
          break
        default:
          node.error(new Error('Unknown Node Type ' + msg.nodetype), msg)
      }

      node.send([msg, {payload: addressSpaceMessages}])
    })

    function changeAddressSpace (msg) {
      switch (parseInt(msg.payload.objecttype)) {
        case 61: // FolderType
          addObjectToAddressSpace(msg, 'Folder')
          break
        default:
          addObjectToAddressSpace(msg, 'Unknown Object Type')
          break
      }
    }

    function addObjectToAddressSpace (msg, humanReadableType) {
      let rootFolder = server.engine.addressSpace.findNode(msg.payload.referenceNodeId)

      if (rootFolder) {
        server.engine.addressSpace.addObject({
          organizedBy: rootFolder,
          nodeId: msg.payload.nodeId,
          browseName: msg.payload.browsename,
          displayName: new LocalizedText({locale: null, text: msg.payload.displayname})
        })
        coreServer.internalDebugLog(msg.payload.nodeId + ' ' + humanReadableType + ' Added To Address Space')
      } else {
        node.error(new Error('Root Reference Not Found'), msg)
      }
    }

    function executeOpcuaCommand (msg) {
      let addressSpace = server.engine.addressSpace

      switch (msg.payload.commandtype) {
        case 'restart':
          restartServer()
          break
        case 'deleteNode':
          if (addressSpace === undefined) {
            coreServer.internalDebugLog('addressSpace undefinded')
            return false
          }

          let searchedNode = addressSpace.findNode(msg.payload.nodeId)
          if (searchedNode !== undefined) {
            addressSpace.deleteNode(searchedNode)
          }
          break
        default:
          node.error(new Error('Unknown OPC UA Command'), msg)
      }
    }

    function restartServer () {
      coreServer.internalDebugLog('Restart OPC UA Server')

      if (server) {
        server.shutdown(0, function () {
          server = null
          initNewServer()
        })
      } else {
        server = null
        initNewServer()
      }

      if (server) {
        coreServer.internalDebugLog('OPC UA Server restarted')
      } else {
        coreServer.internalDebugLogr('Can not restart OPC UA server')
      }
    }

    node.on('close', function () {
      closeServer()
    })

    function closeServer () {
      if (server) {
        if (coreServer.simulatorInterval) {
          clearInterval(coreServer.simulatorInterval)
        }
        coreServer.simulatorInterval = null
        server.shutdown(0, function () {
          server = null
        })
      } else {
        server = null
      }
    }
  }

  RED.nodes.registerType('OPCUA-IIoT-Server', OPCUAIIoTServer)

  RED.httpAdmin.get('/opcuaIIoT/server/specifications', RED.auth.needsPermission('opcuaIIoT.server.read'), function (req, res) {
    xmlFiles.list(function (err, ports) {
      if (err) {
        console.log(err)
      }
      res.json(ports)
    })
  })
}
