# Notes for internal development (DATATRONiQ)

## package.json

Very messing situation on dependency `read-pkg-up`:
- node-red-node-test-helper wants 7.0.1
- jest wants 1.0.1 (package-lock.json)

solution: `npm install -D read-pkg-up@7.0.1`

## Development/Getting started

1. must install Node v14 (`nvm install 14; nvm use 14`)
1. install Node-RED in separate directory
    1. `git clone https://github.com/node-red/node-red.git Node-RED`
    1. `cd Node-RED`
    1. `git checkout tags/2.2.2 -b release-2.2.2`
    1. `npm install`
    1. `npm run build`
    1. `npm run start  -- --verbose`
    1. stop Node-RED again
1. install node-red-contrib-iiot-opcua
    1. `git clone git@gitlab.sigmalto.com:contitech/node-red-contrib-iiot-opcua.git`
    1. `cd node-red-contrib-iiot-opcua`
    1. `git checkout -t origin/development`
    1. `npm install`
    1. `npm run build`
1. after first run of Node-RED, folder `~/.node-red` will be created
1. in folder `~/.node-red` install `node-red-contrib-iiot-opcua` (only once)
    1. `cd ~/.node-red`
    1. `rm -rf node_modules`
    1. `npm install <...>/node-red-contrib-iiot-opcua # --> ~/.node-red/node_modules/node-red-contrib-iiot-opcua`
    1. `cd <...>/Node-RED`
    1. `DEBUG=opcuaIIoT:* npm run start  -- --verbose`

# Docker

### Building an image

```bash
bash build.sh <image_tag>
```

# node-red-contrib-iiot-opcua

## The IoT/IIoT OPC UA toolbox package for [Node-RED][8] based on [node-opcua][9].

[![ISA95](images/logoISA95blue2.png)](https://opcfoundation.org/developer-tools/specifications-unified-architecture/isa-95-common-object-model/)
[![ISA95](images/logoRAMI40blue.png)](http://www.plattform-i40.de/)

* v3.x is now LTS version until Oktober 2019 (branch 3.0)
* tested with Node.js v10 and Node-RED v0.19
* based on node-opcua v0.4 (OPC UA v1.03)
* extendable with node-opcua-isa95

**If you like that contributor's package for OPC UA, then please give us your star at [GitHub][3]!**

[You could also help as a backer of the project.][2]

## Install

Run command on [Node-RED][8] installation directory.

	npm install node-red-contrib-iiot-opcua

or run command for global installation.

	npm install -g node-red-contrib-iiot-opcua

try these options on npm install to build, if you have problems to install

    --unsafe-perm --build-from-source

![Flow Example](images/wiki/browser-listener-flow3-active.png)

To get a special version please set the version with @M.M.F:

    npm install node-red-contrib-iiot-opcua@2.7.1

or global with the -g option of npm. You get more help in the npm docs.
    
## Contributing

Let's work together!
Please, read and in best case accept [CONTRIBUTING](.github/CONTRIBUTING.md) by your sign and send it via E-Mail.
You could also just send a pull request or issues while testing, please!

[Click here if you want to back the project!][2]

### Debug

Debugging on remote devices is important to help users. The verbose logging
provides interesting points in different abstractions if IDE or console debugging is not possible.

Start debug with Node-RED in verbose (-v) mode to get a verbose logging:

    DEBUG=opcuaIIoT* node-red -v 1>nodeREDIIoTOPCUA.log 2>&1

or on local Node-RED

    DEBUG=opcuaIIoT* node red.js -v 1>nodeREDIIoTOPCUAServer.log 2>&1
    
#### Debug Options

Please, read the [Wiki article][7]

### Wiki

Follow the [white rabbit][4]!

### Your own address space model!

With the flex server you could create your own information model with the OPC UA address space.

![Flex server Example](images/wiki/flexServerAddressSapceExamplev3.png)

### Learn with the examples!

The server node contains demo objects and variables
to start playing with OPC UA method call, read and write operations.

see Node-RED menu (right upper corner) -> Import -> Examples -> iiot opcua

![Flow Example](images/wiki/method-call3-active.png)

**... secure reading from OPC UA servers with your own key pairs ...**

![Read Example](images/wiki/read-history3-active.png)

**... and secure writing and moving data between OPC UA servers ...**

![Write Example](images/wiki/write-flow3-active.png)

![Read Write Example](images/wiki/write-read-flow3.png)

**... create your own variables and objects from events ...**

| Node-RED        | UAExpert / Client     |
|-----------------|-----------------------|
|![ASO Example](images/wiki/server-aso-flow3.png)|![ASO UAExpert](images/wiki/ASOTestVariablesUAExpert.png)|

### Reconnect via events with the Flex Connector!

![Flow Flex Connector](images/wiki/flex-connector-flow31.png)

## Package Information

### Known Issues and TODO's

Ideas
* methods calls
  * complex
  * dynamic
  * structured object parameters

Errors
* more Bad status situations handling
* API changes to 0.4.+ bring some breaking changes in connection handling
  * Please, test and report issues via GitHub!

### License

The BSD 3-Clause License

[Klaus Landsdorf][1]

That is a whole new Node-RED package started in 2017 based on the node-opcua v0.4 and the API documentation.
The old copyrights by Mika Karaila are just to honor his pioneer work in the years 2015/2016 for Node-RED and OPC UA.

### Important

This is **not** an official product of the OPC Foundation or Plattform Industrie 4.0.

### Contribution node-opcua

I'd like to give special thanks to [Etienne Rossignon][6]
for the node-opcua packages and very special for the node-opcua-isa95 package!

[1]:https://bianco-royal.cloud/
[2]:https://bianco-royal.cloud/supporter/
[3]:https://github.com/biancode/node-red-contrib-iiot-opcua
[4]:https://github.com/biancode/node-red-contrib-iiot-opcua/wiki
[6]:https://github.com/erossignon
[7]:https://github.com/biancode/node-red-iiot-opcua-publicbeta/wiki/DEBUG
[8]:https://github.com/node-red/node-red
[9]:https://github.com/node-opcua/node-opcua
