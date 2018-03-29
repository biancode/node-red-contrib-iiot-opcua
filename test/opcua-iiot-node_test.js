/**
 * Original Work Copyright 2014 IBM Corp.
 * node-red
 *
 * Copyright (c) 2018 Klaus Landsdorf (http://bianco-royal.de/)
 * All rights reserved.
 * node-red-contrib-iiot-opcua
 *
 **/

'use strict'

var assert = require('chai').assert
var injectNode = require('node-red/nodes/core/core/20-inject')
var inputNode = require('../src/opcua-iiot-node')
var helper = require('node-red-contrib-test-helper')

var testFlowPayload = [
  {
    "id": "n1",
    "type": "inject",
    "name": "TestName",
    "topic": "TestTopicNode",
    "payload": "12345.34",
    "payloadType": "num",
    "repeat": "",
    "crontab": "",
    "once": true,
    "onceDelay": "",
    "wires": [
      [
        "n2",
        "n3"
      ]
    ]
  },
  {id:"n2", type:"helper"},
  {
    "id":"n3",
    "type": "OPCUA-IIoT-Node",
    "injectType": "write",
    "nodeId": "ns=2;s=TestReadWrite",
    "datatype": "String",
    "value": "",
    "name": "TestReadWrite",
    "topic": "",
    "showErrors": false,
    wires:[["n4"]]
  },
  {id:"n4", type:"helper"}
]

var testEventPayloadNumberFlowPayload =  [
  {
    "id": "n1",
    "type": "inject",
    "name": "TestReadWrite",
    "topic": "TestTopicNode",
    "payload": "1234",
    "payloadType": "num",
    "repeat": "",
    "crontab": "",
    "once": true,
    "onceDelay": "",
    "wires": [
      [
        "n2",
        "n3"
      ]
    ]
  },
  {id:"n2", type:"helper"},
  {
    "id": "n3",
    "type": "OPCUA-IIoT-Node",
    "injectType": "write",
    "nodeId": "ns=2;s=TestReadWrite",
    "datatype": "Int16",
    "value": "",
    "name": "TestReadWrite",
    "topic": "",
    "showErrors": false,
    "wires": [
      [
        "n4"
      ]
    ]
  },
  {id:"n4", type:"helper"}
]

var testEventValueNumberFlowPayload =  [
  {
    "id": "n1",
    "type": "inject",
    "name": "TestReadWrite",
    "topic": "",
    "payload": "",
    "payloadType": "str",
    "repeat": "",
    "crontab": "",
    "once": true,
    "onceDelay": "",
    "wires": [
      [
        "n2",
        "n3"
      ]
    ]
  },
  {id:"n2", type:"helper"},
  {
    "id": "n3",
    "type": "OPCUA-IIoT-Node",
    "injectType": "write",
    "nodeId": "ns=2;s=TestReadWrite",
    "datatype": "Int16",
    "value": "2345",
    "name": "TestReadWrite",
    "topic": "NODETOPICOVERRIDE",
    "showErrors": false,
    "wires": [
      [
        "n4"
      ]
    ]
  },
  {id:"n4", type:"helper"}
]


var testEventWithPayloadFlowPayload =  [
  {
    "id": "n1",
    "type": "inject",
    "name": "Error 1",
    "topic": "ERRORS",
    "payload": "1234",
    "payloadType": "num",
    "repeat": "",
    "crontab": "",
    "once": true,
    "onceDelay": "",
    "wires": [
      [
        "n2",
        "n3"
      ]
    ]
  },
  {id:"n2", type:"helper"},
  {
    "id": "n3",
    "type": "OPCUA-IIoT-Node",
    "injectType": "write",
    "nodeId": "ns=5;s=GESTRUCKEST",
    "datatype": "Int16",
    "value": "",
    "name": "ERRORNODE",
    "topic": "",
    "showErrors": false,
    "wires": [
      [
        "n4"
      ]
    ]
  },
  {id:"n4", type:"helper"}
]

describe('OPC UA Node node Testing', function () {
  before(function (done) {
    helper.startServer(done)
  })

  afterEach(function () {
    helper.unload()
  })

  describe('Node node', function () {
    it('should be loaded', function (done) {
      helper.load(
        [inputNode], [{
          "id":"3a234e92.cbc0f2",
          "type": "OPCUA-IIoT-Node",
          "injectType": "inject",
          "nodeId": "ns=2;s=TestReadWrite",
          "datatype": "Double",
          "value": "testpayload",
          "name": "TestReadWrite",
          "topic": "TestTopicNode",
          "showErrors": false,
          "wires":[[]]}
        ],
        function () {
          let nodeUnderTest = helper.getNode('3a234e92.cbc0f2')
          nodeUnderTest.should.have.property('name', 'TestReadWrite')
          nodeUnderTest.should.have.property('nodeId', 'ns=2;s=TestReadWrite')
          nodeUnderTest.should.have.property('datatype', 'Double')
          nodeUnderTest.should.have.property('injectType', 'inject')
          nodeUnderTest.should.have.property('value', 'testpayload')
          nodeUnderTest.should.have.property('topic', 'TestTopicNode')
          done()
        })
    })

    it('should get a message with payload', function(done) {
      helper.load([injectNode, inputNode], testFlowPayload, function() {
        let n2 = helper.getNode("n2")
        n2.on("input", function(msg) {
          msg.should.have.property('payload', 12345.34)
          done()
        })
      })
    })

    it('should verify a message', function(done) {
      helper.load([injectNode, inputNode], testFlowPayload, function() {
        let n4 = helper.getNode("n4")
        n4.on("input", function(msg) {
          msg.should.have.property('addressSpaceItems', [{"name":"TestReadWrite","nodeId":"ns=2;s=TestReadWrite","datatypeName":"String"}]);
          msg.should.have.property('topic', 'TestTopicNode');
          done()
        })
      })
    })

    it('should have payload', function(done) {
      helper.load([injectNode, inputNode], testFlowPayload, function() {
        let n4 = helper.getNode("n4")
        n4.on("input", function(msg) {
          msg.should.have.property('payload', 12345.34);
          done()
        })
      })
    })

    it('should have work with payloads', function(done) {
      helper.load([injectNode, inputNode], testEventWithPayloadFlowPayload, function() {
        let n4 = helper.getNode("n4")
        n4.on("input", function(msg) {
          msg.should.have.property('valuesToWrite', [1234]);
          done()
        })
      })
    })

    it('should have work with payload number', function(done) {
      helper.load([injectNode, inputNode], testEventPayloadNumberFlowPayload, function() {
        let n4 = helper.getNode("n4")
        n4.on("input", function(msg) {
          msg.should.have.property('valuesToWrite', [1234]);
          msg.should.have.property('topic', 'TestTopicNode');
          msg.should.have.property('addressSpaceItems', [{
            "name": "TestReadWrite",
            "nodeId": "ns=2;s=TestReadWrite",
            "datatypeName": "Int16"
          }]);
          msg.should.have.property('payload', 1234);
          done()
        })
      })
    })

    it('should have work with node value', function(done) {
      helper.load([injectNode, inputNode], testEventValueNumberFlowPayload, function() {
        let n4 = helper.getNode("n4")
        n4.on("input", function(msg) {
          msg.should.have.property('valuesToWrite', [2345]);
          msg.should.have.property('payload', '');
          msg.should.have.property('addressSpaceItems', [{
            "name": "TestReadWrite",
            "nodeId": "ns=2;s=TestReadWrite",
            "datatypeName": "Int16"
          }]);
          msg.should.have.property('topic', 'NODETOPICOVERRIDE');
          done()
        })
      })
    })
  })
})