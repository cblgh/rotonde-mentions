var fs = require("fs")
var readline = require("readline")

const BOT_LOOP = 60 * 1000
var botPortal = "./portal.json"
var dataPath = "/home/cblgh/dats/rotonde-scraped/scraped.txt"
var portalPath = "/home/cblgh/dats/rotonde-scraped/network.txt"
var metadataPath = "/home/cblgh/dats/rotonde-scraped/metadata.txt"
var history = {}
var writeQueue = []
var mentions = {}
var metadata = {}
var bot // contains the bot's portal
var command = /follow$/
var dataDelim = "\n"

function findMentions() {
    var reader = createReader(dataPath)

    reader.on("line", (line) => {
        try {
            var msg = JSON.parse(line)
            // new mention from a portal outside one of our followers' network
            if (msg.target && /*follows(msg.target, bot.dat) &&*/ !follows(msg.target, msg.source) && !history[msg.timestamp+msg.source]) {
                if (!mentions[msg.target]) { mentions[msg.target] = []}
                mentions[msg.target].push(msg.source)
                // history[msg.timestamp+msg.source] = true 
            }
        } catch (e) { console.error(e) }
    })
    // the bot has finished reading the scraped data
    reader.on("close", () => {
        processMentions()
        .then(saveFeed)
    })
}

function follows(portal, remote) {
    if (metadata[portal]) {
        return metadata[portal].port.indexOf(remote) >= 0
    }
    return false
}

function follow(target) {
    if (bot.port.indexOf(target) < 0) {
        bot.port.push(target)
    }
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
            var msg = `you have ${mentions[portal].length} new mention${mentions[portal].length > 1 ? "s" : ""} from:\n`
            msg += mentioners.map((datUrl) => {
                if (metadata[datUrl]) { return `@${metadata[datUrl].name} ${datUrl}` }
                return `${datUrl}`
            }).join("\n")
            writeToFeed(msg, portal)
            resolve()
        })
    })
    return Promise.all(promises)
}

function saveFeed() {
    console.log("saving feed")
    console.log(bot.feed)
    return
    fs.readFile(botPortal, (e, data) => {
        if (e) { console.error("Error reading bot's portal.json", e); return }
        try {
            fs.writeFile(botPortal, JSON.stringify(bot, null, 2), (e) => {
                if (e) { console.error("Error writing bot's portal.json", e); return }
                writeQueue = [] // clear queue
                saveHistory()
            })
        } catch (e) { console.error("Error parsing bot's portal.json", e); return }
    })
}

function saveHistory() {
    fs.writeFile("./history", JSON.stringify(history), (e) => {
        if (e) { console.error("Failed to write history", e) }
    })
}

function createReader(path) {
    var reader = readline.createInterface({
        input: fs.createReadStream(dataPath)
    })
    return reader
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, (e, data) => {
            if (e) { return reject(e) }
            resolve(data)
        })
    })
}

var metaPattern = /^(\S+)\s(.+)$/
readFile("./history")
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
            var dat = matches[1]
            var portal = matches[2]
        } else { return }
        try {
            metadata[dat] = JSON.parse(portal)
        } catch (e) {
            console.error(`Error parsing json for ${dat}`)
        }
        console.log(dat, "->", portal)
    })
    return readFile(botPortal)
})
.then((botData) => {
    try {
        bot = JSON.parse(botData.toString())
    } catch (e) { console.error(e); return }
    findMentions()
    setInterval(findMentions, BOT_LOOP)
})
