# Owner playtest feedback on the live build (2026-10-19, verbatim, voice-transcribed)

This. Have some things I don't like. When I'm not even clicking any button, I'm somehow moving. I'm moving to the bottom left, or mostly just left.

There's so many tasks that I don't understand what the fuck to do. There's so many tasks. I don't know what the fuck. It's way too much. I can't understand, and basically, going so slow.

There should be also, during the onboarding period, I was not able to go through everything. Even though I would do exactly what it said on onboarding, it would not work. Especially the part where I got stuck on was the "force descend and go above" part.

Also, you should make an option to go much, much, much faster because this is way too slow in my opinion. Even for my part, because I think the building should be more detailed. It's just black and white, which I don't really understand. What the fuck? It's nice and all, but it's not really getting me to show something.

I'm not seeing why I should see anything or anything like that. All of these quests, I don't understand what the fuck. Maybe you should cut down on the quests. That's on my part, is a mistake. I like the building part.

Again, the main problem is that this is super slow. There's a way to go even faster, almost supersonic at some point. I just don't understand.

I'm able to collect cards, but I don't really understand what the fuck is going on. I'm flying around. It's a good game, but I don't understand what the fuck is going on. I'm collecting so many cards as I fly.

I don't know how to explain this. This is cool and all, but I want to see priority buildings. Let me also do one thing: it doesn't show me also map, it's kinda fucked.

First of all, it's super slow. I understand because there's so much shit going on. I think you should cut down on the number of stuff that's in the actual thing. There's so much, it's causing you to lag, even within my laptop, which makes sense.

Why? Because it's so CPU intensive. I'm just saying, it's super slow, and I don't understand what the fuck is going on.

Some form of realism is definitely needed. I also don't understand a lot of these, I don't understand what the fuck is going on. In my opinion.

Maybe you can give wraps, like light speed. South Park, this is it's kind of cool, but I don't really understand what the fuck is going on. There's not any depth to it or something. There's no one main objective. I think there should be one main objective. It would be pretty cool.

Plus, collecting so many cards is kinda getting annoying. This is cool, I know that I'm getting cards, but it's actually overdoing it because there's so much shit that's going on. Let me see if I can fly to Wisey in the meantime.

Now back to me flying to IC. Again, there should be some supersonic mode to go way faster than the way I am going right now. Let me try flying to YC. I feel like you've gotten some of these buildings incorrectly. I'm not gonna, I'm just gonna trust your judgment.

Again, the buildings look really shit because of course you're i think you can cut down on the map. I feel like you can cut down way more because I did tell you to make it including entire San Francisco. Maybe you can cut it down even less if needed.

I don't know if it's my laptop or anything which is slow, but I think I'm flying to YC right now because I don't see YC here. Let me see, because I'm not seeing YC right now anywhere. Wait. This is not YC. I collected a YC badge, but I know for a fact this isn't YC. This isn't what YC looks like. No.

I think you got some of the maths wrong because this is not what I see. It's kinda disappointing, but at the same time, it's pretty impressive what you were building. Again, I think there's so much going on that I don't understand what the fuck is going on. I think there should be one main objective. Maybe we can cut down on stuff now.

But again, really good job with what you're doing. I'm liking this, but I think making it more bit more detailed is gonna be an intensive part. I think you're gonna have to spend a lot of time just designing a lot of things in detail and then stitching it all together.

# Orchestrator decisions (binding for v2)
- One main objective by default: the Founder Trail, about 18 priority places in order. Each stop: dedicated detailed model and a readable sign (real names, our own type and art, no logos), land there for its card plus a clue to the next stop. The HUD always shows the single current objective, progress n/N, distance and an arrow.
- The earlier 150+ activities stay in the game but are hidden by default behind Settings > "Show side activities" (off). The old Emperor Norton story becomes side content.
- Card reveal popups only for trail stops; other discoveries are silent.
- Flight: zero drift at rest; cruise >= 60 m/s, boost >= 150 m/s, supersonic >= 343 m/s, warp (light speed) to the objective or any trail stop from the map.
- Map must work on the full city. Buildings get color and realism; priority buildings get detail. Performance must hold on a laptop: adaptive quality.
- YC is at Pier 70 in Dogpatch: the two buildings on 20th Street just east of the RH gallery (Fortune 2024-01-12, Potrero View). Our coordinate 37.76082,-122.38604 is close; the problem is the generic 2010-footprint look with no sign.
