const fs = require("fs")
const readline = require("readline")
const datResolve = require("dat-link-resolve")

const BOT_LOOP = 90 * 1000
const botPortal = "./portal.json"
const dataPath = "/home/cblgh/dats/rotonde-scraped/scraped.txt"
const metadataPath = "/home/cblgh/dats/rotonde-scraped/metadata.txt"
const dataDelim = "\n"
const metaPattern = /^(\S+)\s(.+)$/

var history = {}
var mentions = {}
var metadata = {}
var bot // contains the bot's portal

function findMentions() {
    return new Promise((resolve, reject) => {
        var reader = createReader(dataPath)

        reader.on("line", (line) => {
            try {
                var msg = JSON.parse(line)
                if (msg.target) { msg.target = cleanURL(msg.target) }
                if (msg.source) { msg.source = cleanURL(msg.source) }
                // new mention from a portal outside one of our followers' network
                if (msg.target && follows(msg.target, bot.dat) && !follows(msg.target, msg.source) && !history[msg.timestamp+msg.source]) {
                    history[msg.timestamp+msg.source] = true 
                    // the message contains a malformated target, skip 
                    if (typeof msg.target === "object") {
                        console.log("msg.target === object, move on")
                        return
                    }
                    console.log(`adding a mention for ${name(msg.target)} from ${name(msg.source)}`)
                    if (!mentions[msg.target]) { mentions[msg.target] = []}
                    mentions[msg.target].push(msg.source)
                }
            } catch (e) { console.error(e) }
        })
        // the bot has finished reading the scraped data
        reader.on("close", () => {
            processMentions()
            .then(saveFeed).then(resolve)
            .catch(reject)
        })
    })
}

function name(portal) {
    return metadata[portal] ? metadata[portal].name : portal
}

function resetState() {
    return new Promise((resolve, reject) => {
        history = {}
        mentions = {}
        metadata = {}
        resolve()
    })
}

function follows(portal, remote) {
    if (metadata[portal]) {
        return metadata[portal].port.indexOf(remote) >= 0
    }
    return false
}

function writeToFeed(content, target) {
    var msg = {message: content, whisper: true, timestamp: Date.now()}
    if (target) { msg.target = target}
    bot.feed.push(msg)
}

function processMentions() {
    console.log("processing mentions")
    var promises = Object.keys(mentions).map((portal) => {
        return new Promise((resolve, reject) => {
            var mentioners = Array.from(new Set(mentions[portal]))
            var msg = `you have been mentioned by:\n`
            msg += mentioners.map((datUrl) => {
                if (metadata[datUrl]) { return `@${metadata[datUrl].name} ${datUrl}` }
                return `${datUrl}`
            }).join(" \n")
            console.log(msg)
            writeToFeed(msg, portal)
            resolve()
        })
    })
    return Promise.all(promises)
}

function saveFeed() {
    return new Promise((resolve, reject) => {
        console.log("saving feed")
        writeFile(botPortal, JSON.stringify(bot, null, 2))
        .then(saveHistory)
        .then(resolve)
    }).catch((e) => { console.error("Error parsing bot's portal.json", e); reject(e) })
}

function saveHistory() {
    mentions = {}
    return writeFile("./history", JSON.stringify(history))
}

function createReader(path) {
    var reader = readline.createInterface({
        input: fs.createReadStream(dataPath)
    })
    return reader
}

function writeFile(file, data) {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, data, (e) => {
            if (e) { return reject(e) }
            resolve(data)
        })
    })
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, (e, data) => {
            if (e) { return reject(e) }
            resolve(data)
        })
    })
}

function cleanURL(url) {
    if (url && typeof url === "string") {
        url = url.trim()
        while(url[url.length-1] == "/") {
            url = url.slice(0, -1)
        }
        return url + "/"
    } 
    return url
}

function gatherData() {
    return readFile("./history")
    .then((data) => {
        history = JSON.parse(data.toString())
        return readFile(metadataPath)
    })
    .catch((e) => {
        console.log(e)
        return readFile(metadataPath)
    })
    .then((rawMetadata) => {
        rawMetadata = rawMetadata.toString().split(dataDelim)
        rawMetadata.forEach((line) => {
            var matches = line.match(metaPattern)
            if (matches) {
                var dat = cleanURL(matches[1])
                var portal = matches[2]
            } else { return }
            try {
                metadata[dat] = JSON.parse(portal)
            } catch (e) {
                console.error(`Error parsing json for ${dat}`)
            }
        })
        return readFile(botPortal)
    })
    .then((botData) => {
        try {
            bot = JSON.parse(botData.toString())
        } catch (e) { console.error(e); return }
    })
}

function loop() {
    return gatherData()
    .then(findMentions)
    .then(resetState)
}

function main() {
    loop()
    .then(setTimeout(function timeoutRecursion() {
        loop()
        .then(() => {console.log("done"); setTimeout(timeoutRecursion, BOT_LOOP)})
    }, BOT_LOOP))
}

main()
