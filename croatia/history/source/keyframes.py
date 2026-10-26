# Keyframe definitions: base dataset snapshot + hand corrections.
# Coordinates are (lon, lat). Override polygons are approximate and clipped to land.

P = {
 # ---- recurring hand-drawn shapes ----
 'ven_dalm': [(13.45,45.55),(13.95,45.62),(14.2,45.3),(14.4,45.05),(14.9,44.7),(15.3,44.3),(15.7,44.0),
              (16.3,43.62),(16.6,43.47),(17.2,43.12),(17.5,42.98),(17.3,42.75),(16.6,42.6),(16.0,42.9),
              (15.0,43.3),(14.4,44.0),(13.8,44.6),(13.45,44.8)],
 'kotor': [(18.45,42.56),(18.82,42.56),(18.87,42.36),(18.55,42.40)],
 'crete': [(23.4,35.75),(26.45,35.75),(26.45,34.8),(23.4,34.8)],
 'corfu': [(19.55,39.95),(20.2,39.95),(20.2,39.35),(19.55,39.35)],
 'kefalonia': [(20.3,38.6),(20.9,38.6),(20.9,37.98),(20.3,37.98)],
 'zakynthos': [(20.55,37.97),(21.0,37.97),(21.0,37.6),(20.55,37.6)],
 'lefkada': [(20.5,38.88),(20.78,38.88),(20.78,38.56),(20.5,38.56)],
 'euboea': [(22.75,39.05),(24.65,39.05),(24.65,37.95),(23.95,37.95),(23.3,38.3),(22.75,38.8)],
 'morea': [(21.0,38.42),(22.3,38.3),(22.9,38.0),(23.05,37.92),(23.6,37.62),(23.6,36.3),(21.0,36.3)],
 'wallachia': [(22.4,44.65),(22.7,45.2),(23.5,45.45),(24.6,45.4),(25.4,45.4),(26.5,45.65),(27.3,45.5),
               (27.95,45.3),(27.95,44.6),(27.3,44.1),(26.2,43.95),(25.0,43.62),(23.6,43.78),(22.9,43.85)],
 'moldavia': [(25.3,48.4),(26.6,48.4),(27.6,48.45),(28.9,47.95),(29.65,46.9),(28.7,46.25),(28.2,45.5),
              (27.3,45.55),(26.5,45.8),(26.2,46.4),(25.7,47.0),(25.3,47.6)],
 'transylvania': [(21.9,47.7),(23.5,47.95),(24.8,47.65),(25.65,47.0),(26.1,46.3),(25.6,45.55),(24.0,45.45),
                  (22.6,45.3),(21.6,46.2),(21.4,47.0)],
 'habs_1600': [(12.0,48.4),(18.6,48.4),(18.2,47.6),(17.9,47.4),(17.3,46.9),(16.9,46.45),(16.8,46.2),(16.3,45.9),
               (16.0,45.5),(15.6,45.2),(15.3,44.9),(14.95,44.95),(14.45,45.32),(13.95,45.62),(13.7,45.8),(12.0,46.6)],
 'habs_1700': [(12.0,48.4),(26.6,48.4),(26.0,47.0),(26.1,46.4),(25.6,45.6),(24.5,45.4),(23.0,45.3),(22.4,45.6),
               (21.5,46.2),(20.9,46.15),(20.2,45.5),(20.1,45.15),(19.4,45.0),(18.6,45.1),(17.5,45.15),(16.9,45.25),
               (16.3,45.05),(15.9,44.75),(15.7,44.35),(15.3,44.4),(15.0,44.6),(14.6,45.2),(14.3,45.4),(13.9,45.6),
               (13.6,45.8),(12.0,46.7)],
 'habs_1800': [(12.0,48.4),(26.6,48.4),(26.0,47.0),(26.1,46.4),(25.6,45.6),(24.5,45.4),(23.0,45.3),(22.4,44.7),
               (21.4,44.75),(20.45,44.83),(19.4,44.95),(18.6,45.1),(17.5,45.15),(16.9,45.25),(16.3,45.05),
               (15.9,44.75),(15.85,44.3),(16.25,43.95),(16.9,43.55),(17.6,43.05),(17.3,42.75),(16.6,42.6),
               (16.0,42.9),(15.0,43.3),(14.4,44.0),(13.8,44.6),(13.45,44.8),(13.4,45.6),(12.0,46.7)],
 'illyria': [(12.0,46.75),(14.0,46.7),(14.9,46.45),(15.6,46.1),(16.0,45.85),(16.4,45.45),(16.9,45.25),
             (16.2,45.0),(15.8,44.6),(16.3,44.1),(16.9,43.6),(17.5,43.1),(18.0,42.95),(18.6,42.65),
             (18.95,42.4),(18.6,42.25),(16.0,42.3),(13.0,44.5),(12.0,45.6)],
 'greece_1832': [(20.78,39.08),(23.0,39.28),(24.8,39.1),(25.95,38.2),(25.95,36.0),(21.05,36.0),(21.05,38.4),
                 (20.78,38.55)],
 'serbia_1830': [(19.25,44.0),(19.3,44.82),(20.3,44.85),(21.5,44.75),(22.6,44.3),(22.4,43.8),(21.9,43.4),
                 (21.0,43.2),(20.2,43.4),(19.6,43.7)],
 'monte_1830': [(18.75,42.42),(18.9,42.68),(19.3,42.88),(19.55,42.68),(19.3,42.48),(19.0,42.33)],
 'dusan': [(18.55,42.45),(18.9,43.0),(19.1,43.5),(19.3,44.0),(19.6,44.4),(20.3,44.6),(21.4,44.7),(22.2,44.4),
           (22.5,43.8),(22.6,43.0),(22.9,42.3),(23.3,41.8),(23.7,41.5),(23.9,40.85),(23.4,40.95),(23.0,41.0),
           (22.6,40.9),(22.4,40.5),(22.6,40.1),(22.9,39.4),(22.6,38.95),(21.8,38.85),(21.0,38.75),(20.0,38.9),
           (19.2,39.8),(19.1,40.5),(19.2,41.2),(19.2,41.9),(18.9,42.1),(18.5,42.35)],
 'gallipoli': [(26.55,40.66),(26.97,40.56),(26.62,40.37),(26.40,40.20),(26.25,40.02),(26.08,40.08),(26.30,40.42)],
 'serb_desp': [(19.3,44.0),(19.4,44.75),(20.4,44.85),(21.4,44.75),(22.0,44.5),(21.9,43.9),(21.6,43.3),
               (20.9,42.75),(20.4,42.6),(20.0,43.0),(19.5,43.4),(19.2,43.8)],
 'albania_1453': [(19.4,42.1),(19.9,42.2),(20.3,41.9),(20.3,41.3),(20.0,41.0),(19.5,41.1),(19.4,41.4)],
 'byz_1453_thrace': [(28.6,41.35),(29.2,41.35),(29.2,40.95),(28.6,40.95)],
}

# Capitals (lon, lat)
C = {
 'Athens':(23.73,37.98),'Sparta':(22.43,37.07),'Pella':(22.52,40.76),'Persepolis':(52.89,29.94),
 'Babylon':(44.42,32.54),'Lysimachia':(26.75,40.55),'Rome':(12.50,41.90),'Sarmizegetusa':(23.31,45.62),
 'Seuthopolis':(25.30,42.62),'Sirmium':(19.61,44.97),'Thessalonica':(22.94,40.64),'Nicomedia':(29.92,40.77),
 'Mediolanum':(9.19,45.46),'Constantinople':(28.98,41.01),'Ravenna':(12.20,44.42),'Pliska':(27.12,43.38),
 'Preslav':(26.82,43.16),'Nin':(15.19,44.24),'Ras':(20.49,43.12),'Ohrid':(20.80,41.12),'Esztergom':(18.74,47.79),
 'Biograd':(15.44,43.94),'Tarnovo':(25.63,43.08),'Skopje':(21.43,42.00),'Edirne':(26.56,41.68),'Buda':(19.04,47.50),
 'Bobovac':(18.25,44.06),'Smederevo':(20.93,44.66),'Krujë':(19.79,41.51),'Mystras':(22.37,37.07),
 'Venice':(12.33,45.44),'Vienna':(16.37,48.21),'Pressburg':(17.11,48.15),'Alba Iulia':(23.58,46.07),
 'Târgoviște':(25.46,44.93),'Suceava':(26.25,47.65),'Bucharest':(26.10,44.43),'Iași':(27.60,47.16),
 'Cetinje':(18.92,42.39),'Ljubljana':(14.51,46.06),'Belgrade':(20.46,44.82),'Kragujevac':(20.91,44.01),
 'Nafplio':(22.80,37.57),'Sofia':(23.32,42.70),'Sarajevo':(18.41,43.86),'Durrës':(19.45,41.32),
 'Tirana':(19.82,41.33),'Budapest':(19.04,47.50),'Ankara':(32.86,39.93),'Zagreb':(15.98,45.81),
 'Podgorica':(19.26,42.44),'Pristina':(21.17,42.67),'Chișinău':(28.86,47.01),'Corfu':(19.92,39.62),
 'Arta':(20.99,39.16),'Bursa':(29.06,40.19),'Bratislava':(17.11,48.15),'Prizren':(20.74,42.21),
}

# family colour keys -> palette (resolved by substring, first match wins)
FAMILIES = [
 ('ragusa','#f2c230'),
 ('illyrian provinces','#4a68c9'),
 ('septinsular','#7fa7d8'),
 ('eastern roman','#8a64b5'),('byzantine','#8a64b5'),('western roman','#b08fd6'),('roman','#9b72c4'),
 ('rome','#9b72c4'),('tetrarch','#9b72c4'),
 ('ottoman','#3f9a78'),('turkey','#5fae8f'),
 ('habsburg','#e2b14a'),('austria','#e2b14a'),('holy roman','#e8c77a'),
 ('venice','#cf4a43'),('venetian','#cf4a43'),
 ('hungary','#e08a4f'),('magyar','#e08a4f'),
 ('bulgar','#5d8c3c'),
 ('serb','#9b3d6c'),('raška','#9b3d6c'),('yugoslavia','#5b7fa8'),
 ('croatia','#e07d82'),('bosnia','#2f7f9c'),('slovenia','#86c0a8'),('kosovo','#9aa7b5'),
 ('north macedonia','#c9649c'),('macedonia (','#c9649c'),
 ('kassander','#2c4f8c'),('alexander','#2c4f8c'),('macedon','#2c4f8c'),('lysimachus','#5a7bb5'),
 ('antigonus','#7d6aa8'),('greek','#4d8fd6'),('greece','#4d8fd6'),('hellenic','#4d8fd6'),
 ('romania','#d8bf55'),('wallachia','#d8bf55'),('moldavia','#c9b04a'),('moldova','#c9b04a'),
 ('dacia','#c8a95a'),('transylvania','#c69a4a'),
 ('albania','#8a3a3a'),('montenegro','#8b6b4a'),('despotate of the morea','#a98bd0'),('epirus','#a98bd0'),
 ('achaemenid','#a77d55'),('seleucid','#a77d55'),('persia','#a77d55'),
 ('odrysian','#b99c74'),('thrac','#b99c74'),('illyrian','#b8a688'),('dardania','#b8a688'),
 ('avar','#c2a77e'),('hun','#c2a77e'),('goth','#a8a26e'),('slav','#bdb59a'),('cuman','#c2a77e'),
 ('golden horde','#c2a77e'),('sarmat','#c2a77e'),('celt','#bdb59a'),('hallstatt','#bdb59a'),
 ('italy','#b4bfa6'),('naples','#b4bfa6'),('sicil','#b4bfa6'),('papal','#b4bfa6'),('aragon','#b4bfa6'),
 ('lombard','#b4bfa6'),('benevento','#b4bfa6'),('carolingian','#b4bfa6'),('francia','#b4bfa6'),
 ('frank','#b4bfa6'),('sabin','#b4bfa6'),('samnite','#b4bfa6'),('etrur','#b4bfa6'),('carthag','#b4bfa6'),
 ('russia','#bcae9f'),('ussr','#bcae9f'),('ukraine','#bcae9f'),('poland','#bcae9f'),('galicia','#bcae9f'),
 ('slovakia','#bcae9f'),('germany','#bcae9f'),
]

# helpers to build rename tables
def R(**kw): return kw

KEYFRAMES = [
 dict(year=-500, file='bc500', title='The Greek World & Persia',
      caption='Greek city-states led by Athens and Sparta face the Persian\nEmpire across the Aegean. Illyrian and Thracian tribes hold the interior.',
      rename={'Greek city-states':'Greek city-states','Achaemenid Empire':'Persian (Achaemenid) Empire','Illyrians':'Illyrian tribes'},
      caps=['Athens','Sparta','Persepolis'], ragusa='pre'),
 dict(year=-323, file='bc323', title='Alexander the Great',
      caption='Macedon conquers Greece and the Persian Empire.\nAlexander dies in Babylon in 323 BC.',
      rename={'Empire of Alexander':'Macedonian Empire (Alexander)'},
      caps=['Pella','Babylon'], ragusa='pre'),
 dict(year=-300, file='bc300', title='The Successor Kingdoms',
      caption="Alexander's generals carve up his empire:\nKassander takes Macedon, Lysimachus takes Thrace.",
      rename={'Kingdom of Kassander':'Macedon (Kassander)','Kingdom of Lysimachus':'Thrace (Lysimachus)',
              'Kingdom of Antigonus':'Antigonid Asia'},
      caps=['Pella','Lysimachia'], ragusa='pre'),
 dict(year=-200, file='bc200', title='Rome Arrives',
      caption='Rome crosses the Adriatic. Macedon and its Hellenic League\nwill fall to Rome by 168 BC.',
      rename={'Macedon and Hellenic League':'Macedon & Hellenic League','Rome':'Roman Republic','?':None},
      caps=['Rome','Pella'], ragusa='pre'),
 dict(year=-100, file='bc100', title='Roman Republic',
      caption='Macedonia and Greece are Roman provinces.\nThe Dacians hold the lands north of the Danube.',
      rename={'Dacians':'Dacian kingdom'}, caps=['Rome','Sarmizegetusa'], ragusa='pre'),
 dict(year=14, file='bc1', title='Augustus: The Roman Empire',
      caption='Rome rules almost the whole peninsula.\nDacia remains independent beyond the Danube.',
      rename={'Dacia':'Dacian kingdom','Odrysian Kingdom':'Odrysian Thrace (Roman client)'},
      caps=['Rome','Sarmizegetusa','Seuthopolis'], ragusa='epi'),
 dict(year=200, file='200', title='The Roman Empire at its Height',
      caption='Trajan conquers Dacia (106 AD). The Danube frontier\nis lined with legions and new cities.',
      rename={}, caps=['Rome'], ragusa='epi'),
 dict(year=300, file='300', title='The Tetrarchy',
      caption='Diocletian splits rule among four emperors. Balkan cities\nlike Sirmium and Thessalonica become imperial seats.',
      rename={'Rome (Galerius)':'Tetrarchy: Galerius','Rome (Maximian)':'Tetrarchy: Maximian',
              'Rome (Diocletianus)':'Tetrarchy: Diocletian'},
      caps=['Sirmium','Thessalonica','Nicomedia','Mediolanum'], ragusa='epi'),
 dict(year=400, file='400', title='East and West Divide',
      caption='The empire splits for good in 395. The border runs through\nthe Balkans — roughly today\'s Bosnia–Serbia line.',
      rename={}, caps=['Constantinople','Ravenna'], ragusa='epi'),
 dict(year=500, file='500', title='Ostrogoths & Byzantium',
      caption='The West has fallen. Theodoric\'s Ostrogoths rule Italy and\nDalmatia; Constantinople rules the rest.',
      rename={'Ostrogoths':'Ostrogothic Kingdom'}, caps=['Constantinople','Ravenna'], ragusa='epi'),
 dict(year=650, file='600', title='Avars & Slavs',
      caption='Avars and Slavs overrun the interior. Refugees from\nEpidaurum found Ragusa on a rocky islet (c. 614).',
      rename={'Avars':'Avar Khaganate','Slavs':'Slavic tribes'}, caps=['Constantinople'], ragusa='early'),
 dict(year=700, file='700', title='The Bulgars Arrive',
      caption='The First Bulgarian Empire is founded south of the\nDanube in 681, with its capital at Pliska.',
      rename={'Avars':'Avar Khaganate','Danube Bulgars':'First Bulgarian Empire','Slavs':'Slavic tribes'},
      caps=['Constantinople','Pliska'], ragusa='early'),
 dict(year=900, file='900', title='Medieval Kingdoms Emerge',
      caption='Croatia, Serbia and Bulgaria take shape. Bulgaria is now\nChristian; the Magyars settle the Danube basin.',
      rename={'Avars':'Magyars','Bulgars':'First Bulgarian Empire','Croatian kingdom':'Kingdom of Croatia',
              'Serbia':'Principality of Serbia','Chelmia':'Zahumlje'},
      caps=['Constantinople','Preslav','Nin','Ras'], ragusa='byz'),
 dict(year=1000, file='1000', title='Byzantium Strikes Back',
      caption='Emperor Basil II wages war on Tsar Samuel of Bulgaria;\nby 1018 Bulgaria is absorbed. Hungary becomes a kingdom.',
      rename={'Bulgar Khanate':'First Bulgarian Empire (Samuel)','Magyars':'Kingdom of Hungary',
              'Serbia':'Serbian principalities','Croatia':'Kingdom of Croatia','Peshemegs':'Pechenegs'},
      caps=['Constantinople','Ohrid','Esztergom','Biograd'], ragusa='byz'),
 dict(year=1100, file='1100', title='Byzantium & Hungary',
      caption='Byzantium rules the south; Croatia enters a union with\nthe Hungarian crown (1102).',
      rename={'Bulgar Khanate':'Byzantine Empire','Alans':'Cumans','Croatia':'Croatia (Hungarian crown)',
              'Serbia':'Serbian principalities'},
      caps=['Constantinople','Esztergom','Ras'], ragusa='byz'),
 dict(year=1200, file='1200', title='The Second Bulgarian Empire',
      caption='Bulgaria rises again from Tarnovo (1185). In 1204 the\nFourth Crusade sacks Constantinople; Venice takes Ragusa.',
      rename={'Bulgar Khanate':'Second Bulgarian Empire','Croatia':'Croatia (Hungarian crown)'},
      caps=['Constantinople','Tarnovo','Esztergom'], ragusa='venice'),
 dict(year=1300, file='1300', title='Restored Byzantium, Rising Serbia',
      caption='Byzantium retakes Constantinople (1261) but is weakened.\nSerbia under the Nemanjić dynasty expands south.',
      rename={'Bulgar Khanate':'Bulgarian Empire','Raška':'Kingdom of Serbia','Sicily':'Angevin Naples'},
      caps=['Constantinople','Tarnovo','Skopje','Buda'], ragusa='venice'),
 dict(year=1355, file='1300', title='The Serbian Empire of Dušan',
      caption='Stefan Dušan, crowned Emperor in Skopje (1346), rules\nfrom the Danube to the Gulf of Corinth. The Ottomans land at Gallipoli (1354).',
      rename={'Bulgar Khanate':'Bulgarian Empire','Raška':'Serbian Empire','Sicily':'Angevin Naples'},
      over=[('Serbian Empire','dusan'),('Ottoman Empire','gallipoli'),('Wallachia','wallachia')],
      caps=['Constantinople','Tarnovo','Skopje','Buda','Bursa'], ragusa='rep'),
 dict(year=1453, file='1492', title='Fall of Constantinople',
      caption='The Ottomans take Constantinople and make it their capital.\nThe last Serbian, Bosnian, Albanian and Greek states fall within 30 years.',
      rename={'Imperial Hungary':'Kingdom of Hungary','Aragón':'Naples (Aragon)'},
      over=[('Venice','ven_dalm'),('Venice','kotor'),('Venice','crete'),('Venice','corfu'),('Venice','euboea'),
            ('Wallachia (Ottoman tributary)','wallachia'),('Moldavia','moldavia'),
            ('Serbian Despotate','serb_desp'),('Kingdom of Bosnia','@BIH'),('League of Lezhë (Albania)','albania_1453'),
            ('Despotate of the Morea','morea')],
      caps=['Constantinople','Buda','Smederevo','Bobovac','Krujë','Mystras','Venice','Târgoviște','Suceava'],
      ragusa='rep'),
 dict(year=1600, file='1600', title='The Ottoman Balkans',
      caption='After Mohács (1526) Hungary is partitioned. The Habsburgs\nhold a thin frontier; Venice keeps the coast; Ragusa pays tribute and trades.',
      rename={'Naples':'Naples (Spanish)'},
      over=[('Habsburg Monarchy','habs_1600'),('Venice','ven_dalm'),('Venice','kotor'),('Venice','crete'),
            ('Venice','corfu'),('Venice','kefalonia'),('Venice','zakynthos'),
            ('Transylvania (Ottoman vassal)','transylvania'),('Wallachia (Ottoman vassal)','wallachia'),
            ('Moldavia (Ottoman vassal)','moldavia')],
      caps=['Constantinople','Pressburg','Venice','Alba Iulia','Târgoviște','Suceava'], ragusa='rep'),
 dict(year=1700, file='1700', title='Treaty of Karlowitz',
      caption='After the failed siege of Vienna (1683) the Habsburgs take\nHungary and Croatia; Venice takes the Morea. Ragusa cedes Neum as a buffer.',
      rename={'Austrian Empire':'Habsburg Monarchy'},
      over=[('Habsburg Monarchy','habs_1700'),('Venice','ven_dalm'),('Venice','kotor'),('Venice','morea'),
            ('Venice','corfu'),('Venice','kefalonia'),('Venice','zakynthos'),('Venice','lefkada'),
            ('Wallachia (Ottoman vassal)','wallachia'),('Moldavia (Ottoman vassal)','moldavia')],
      caps=['Constantinople','Vienna','Venice','Bucharest','Iași','Cetinje'], ragusa='rep1699'),
 dict(year=1800, file='1800', title='The End of Venice',
      caption='Napoleon ends the Venetian Republic (1797). Austria takes\nDalmatia; the Ionian Islands become a Russo-Ottoman protectorate.',
      rename={'Austrian Empire':'Habsburg Monarchy'},
      over=[('Habsburg Monarchy','habs_1800'),('Habsburg Monarchy','kotor'),
            ('Septinsular Republic','corfu'),('Septinsular Republic','kefalonia'),('Septinsular Republic','zakynthos'),
            ('Septinsular Republic','lefkada'),('Wallachia (Ottoman vassal)','wallachia'),
            ('Moldavia (Ottoman vassal)','moldavia'),('Montenegro','monte_1830')],
      caps=['Constantinople','Vienna','Bucharest','Iași','Cetinje','Corfu'], ragusa='rep1699'),
 dict(year=1810, file='1815', title="Napoleon's Illyrian Provinces",
      caption='French troops end the Republic of Ragusa (1808). The coast\nfrom Ljubljana to Kotor becomes part of the French Empire. Serbs revolt (1804).',
      rename={'Austrian Empire':'Austrian Empire'},
      over=[('Illyrian Provinces (France)','illyria'),('Wallachia (Ottoman vassal)','wallachia'),
            ('Moldavia (Ottoman vassal)','moldavia'),('Montenegro','monte_1830'),
            ('Revolutionary Serbia','serbia_1830')],
      caps=['Constantinople','Vienna','Ljubljana','Belgrade','Bucharest','Cetinje'], ragusa='french'),
 dict(year=1832, file='1815', title='Greek & Serbian Independence',
      caption='Greece wins independence (1830–32). Serbia is an autonomous\nprincipality. Ragusa is now Austrian Dalmatia.',
      rename={'Austrian Empire':'Austrian Empire'},
      over=[('Austrian Empire','habs_1800'),('Austrian Empire','kotor'),('Kingdom of Greece','greece_1832'),
            ('Principality of Serbia','serbia_1830'),('Montenegro','monte_1830'),
            ('Wallachia','wallachia'),('Moldavia','moldavia'),('British Ionian Islands','corfu'),
            ('British Ionian Islands','kefalonia'),('British Ionian Islands','zakynthos'),('British Ionian Islands','lefkada')],
      caps=['Constantinople','Vienna','Nafplio','Kragujevac','Cetinje','Bucharest','Iași'], ragusa='austria'),
 dict(year=1878, file='1880', title='Congress of Berlin',
      caption='Serbia, Montenegro and Romania become fully independent;\nBulgaria is reborn. Austria-Hungary occupies Bosnia.',
      rename={'Austria Hungary':'Austria-Hungary','Bosnia-Herzegovina':'Bosnia (Austro-Hungarian)'},
      caps=['Constantinople','Vienna','Budapest','Belgrade','Cetinje','Bucharest','Sofia','Athens','Sarajevo'],
      ragusa='austria'),
 dict(year=1913, file='1914', title='The Balkan Wars',
      caption='The Ottomans lose almost all of Europe. Albania is born.\nIn 1914 a shot in Sarajevo starts the First World War.',
      rename={'Austro-Hungarian Empire':'Austria-Hungary','Kingdom of Italy':'Italy'},
      caps=['Constantinople','Vienna','Belgrade','Cetinje','Bucharest','Sofia','Athens','Durrës'], ragusa='austria'),
 dict(year=1920, file='1920', title='After the First World War',
      caption='Austria-Hungary collapses. The Kingdom of Serbs, Croats\nand Slovenes (Yugoslavia) unites the South Slavs. Romania doubles.',
      rename={'Yugoslavia':'Kingdom of Serbs, Croats & Slovenes','Ottoman Sultanate':'Ottoman Empire'},
      caps=['Belgrade','Bucharest','Sofia','Athens','Tirana','Constantinople','Vienna','Budapest'], ragusa='yugo'),
 dict(year=1938, file='1938', title='The Interwar Balkans',
      caption='The Republic of Turkey moves its capital to Ankara.\nWorld War II will bring occupation and partition (1941–45).',
      rename={'Yugoslavia':'Kingdom of Yugoslavia'},
      caps=['Belgrade','Bucharest','Sofia','Athens','Tirana','Ankara','Vienna','Budapest'], ragusa='yugo'),
 dict(year=1960, file='1960', title='The Cold War',
      caption="Tito's socialist Yugoslavia stays non-aligned. Albania,\nBulgaria and Romania are communist; Greece and Turkey join NATO.",
      rename={'Yugoslavia':'Socialist Yugoslavia (SFRY)'},
      caps=['Belgrade','Bucharest','Sofia','Athens','Tirana','Ankara','Vienna','Budapest'], ragusa='yugo'),
 dict(year=1995, file='1994', title='Yugoslavia Breaks Apart',
      caption='Slovenia, Croatia, Bosnia and Macedonia declare independence\n(1991–92). Dubrovnik is besieged 1991–92.',
      rename={'Serbia':'FR Yugoslavia','Montenegro':'FR Yugoslavia','Macedonia':'Macedonia (FYROM)'},
      caps=['Belgrade','Zagreb','Ljubljana','Sarajevo','Skopje','Tirana','Sofia','Bucharest','Athens','Chișinău','Ankara','Budapest','Vienna'],
      ragusa='croatia'),
 dict(year=2026, file='MODERN', title='The Balkans Today',
      caption='Montenegro (2006) and Kosovo (2008, recognition disputed)\ncomplete the map. Dubrovnik is in Croatia.',
      rename={},
      caps=['Belgrade','Zagreb','Ljubljana','Sarajevo','Skopje','Tirana','Podgorica','Pristina','Sofia','Bucharest',
            'Athens','Chișinău','Ankara','Budapest','Vienna'], ragusa='croatia'),
]

def fmt_year(y):
    return f'{-y} BC' if y < 0 else (f'{y} AD' if y < 1000 else str(y))

# ======================= v2: corrections & new eras =======================
P.update({
 'sb_clip_serbia': [(18.8,44.9),(19.4,44.92),(20.4,44.83),(21.4,44.78),(22.8,44.7),(23.2,42.0),(18.8,42.0)],
 'serbia_1878': [(19.0,44.95),(20.3,44.86),(21.4,44.78),(22.8,44.65),(22.9,43.2),(22.4,42.35),(21.95,42.3),
                 (21.6,42.75),(21.2,43.0),(20.6,43.15),(20.3,43.45),(19.5,43.55),(19.1,43.9)],
 'monte_1878': [(18.4,42.5),(18.6,43.05),(19.1,43.15),(19.6,42.9),(19.85,42.55),(19.4,41.98),(18.9,42.25)],
 'bg_princ_1878': [(22.3,44.3),(28.7,44.3),(28.7,42.65),(27.9,42.75),(27.0,42.85),(26.0,42.85),(25.0,42.75),
                   (24.0,42.62),(23.6,42.3),(23.2,42.1),(22.3,42.2)],
 'rumelia': [(23.6,42.3),(24.0,42.62),(25.0,42.75),(26.0,42.85),(27.0,42.85),(27.9,42.75),(28.7,42.65),(28.7,41.9),
             (27.5,41.95),(26.4,41.75),(25.2,41.75),(24.3,41.9),(23.9,42.05)],
 'ss_greek_part': [(20.9,41.0),(21.3,40.85),(21.6,40.55),(22.3,40.75),(22.75,41.05),(23.2,40.95),(23.6,40.78),
                   (24.2,40.85),(24.8,40.9),(25.4,40.85),(25.9,41.2),(25.9,41.75),(24.0,41.75),(23.0,41.45),(21.0,41.3)],
 'w_thrace': [(24.75,41.6),(26.3,41.75),(26.3,40.75),(24.75,40.8)],
 'europe_turk': [(25.9,42.15),(28.2,42.1),(29.15,41.25),(29.0,41.0),(28.0,40.95),(27.3,40.65),(26.75,40.5),
                 (26.2,40.0),(25.9,40.1)],
 'latin_emp': [(25.9,40.9),(26.3,41.5),(26.9,41.9),(27.9,41.95),(28.6,41.6),(29.15,41.25),(29.0,41.0),(28.0,40.95),
               (27.3,40.65),(26.75,40.5),(26.2,40.0),(25.9,40.4)],
 'latin_asia': [(27.5,40.45),(29.4,40.75),(29.95,40.95),(30.05,40.75),(29.3,40.55),(27.5,40.3)],
 'thessalonica_k': [(21.5,41.2),(22.6,41.4),(23.6,41.35),(24.5,41.05),(24.6,40.8),(23.6,40.0),(22.9,39.2),(22.3,38.95),
                    (21.6,39.3),(21.3,40.0),(21.2,40.7)],
 'epirus_d': [(19.35,41.35),(20.5,41.35),(21.2,40.8),(21.3,40.0),(21.6,39.3),(22.3,38.95),(22.3,38.4),(21.0,38.3),
              (20.1,38.9),(19.4,39.8),(19.3,40.6)],
 'athens_d': [(22.6,38.65),(23.6,38.75),(24.15,38.1),(24.1,37.6),(23.05,37.92),(22.6,38.2)],
 'nicaea': [(26.0,40.3),(27.5,40.3),(29.3,40.55),(30.05,40.72),(30.3,40.75),(30.3,36.0),(26.0,36.0)],
 'belgrade_1521': [(18.9,45.25),(20.6,45.3),(21.4,44.9),(21.3,44.5),(19.3,44.6)],
 'slo_north': [(13.3,46.7),(16.7,46.95),(16.7,46.12),(13.3,46.12)],
 'slo_south': [(13.3,46.12),(15.75,46.12),(15.75,45.4),(13.3,45.4)],
 'dalm_1942': [(15.0,44.25),(15.6,44.15),(16.0,43.75),(16.5,43.55),(16.55,43.45),(15.9,43.4),(15.2,43.8),(14.8,44.2)],
 'greater_alb': [(20.0,42.9),(21.0,43.1),(21.3,42.6),(21.15,41.95),(21.0,41.1),(20.4,40.9),(20.0,41.5)],
 'bg_greek_thrace': [(23.6,41.5),(26.3,41.75),(26.3,40.75),(24.0,40.7),(23.6,40.85)],
 'n_transylvania': [(21.9,47.9),(25.0,47.9),(26.3,47.6),(26.1,46.9),(25.8,46.35),(24.8,46.4),(24.0,46.55),(23.3,46.55),
                    (22.5,46.65),(21.9,46.75),(21.5,46.9)],
 'backa': [(18.8,46.2),(20.2,46.2),(20.3,45.4),(19.0,45.2)],
 'srem': [(19.0,45.25),(20.35,45.2),(20.35,44.8),(19.0,44.85)],
 'krajina_knin': [(15.5,44.9),(16.3,45.15),(16.5,44.85),(16.2,44.3),(16.45,43.95),(16.1,43.75),(15.75,44.0),(15.4,44.45)],
 'krajina_ws': [(16.95,45.45),(17.45,45.6),(17.5,45.3),(17.0,45.25)],
 'krajina_es': [(18.8,45.75),(19.4,45.9),(19.45,45.15),(18.9,45.1),(18.6,45.4)],
})
C.update({'Nicaea':(29.72,40.43),'Plovdiv':(24.75,42.15)})

# names are matched in order; these must beat the generic rules further down
FAMILIES[:0] = [
 ('romania','#d8bf55'),('serbs, croats','#5b7fa8'),('yugoslav','#5b7fa8'),('fr yugoslavia','#7b93b3'),
 ('serb-held','#7b93b3'),('rumelia','#86a865'),('latin','#c26b8f'),('thessalonica','#d394b0'),
 ('achaea','#e0a8c0'),('duchy of athens','#e0a8c0'),('nicaea','#a98bd0'),('independent state of croatia','#c25c5c'),
 ('germany','#7d7d7d'),('nazi','#7d7d7d'),
]

# capital "lineages": (start year, capital) — drawn as faint trails behind the current capital
TRAILS = [
 [(-27,'Rome'),(330,'Constantinople')],
 [(1326,'Bursa'),(1369,'Edirne'),(1453,'Constantinople'),(1923,'Ankara')],
 [(681,'Pliska'),(893,'Preslav'),(997,'Ohrid'),(1185,'Tarnovo'),(1879,'Sofia')],
 [(1170,'Ras'),(1346,'Skopje'),(1430,'Smederevo'),(1818,'Kragujevac'),(1841,'Belgrade')],
 [(1000,'Esztergom'),(1300,'Buda'),(1536,'Pressburg'),(1873,'Budapest')],
 [(1829,'Nafplio'),(1834,'Athens')],
 [(1700,'Cetinje'),(2006,'Podgorica')],
]

def _kf(year): return next(k for k in KEYFRAMES if k['year'] == year and not k.get('label'))
def _idx(year): return KEYFRAMES.index(_kf(year))

_kf(900)['rename']['Croatian kingdom'] = 'Duchy of Croatia'
_kf(900)['caption'] = ('Croatia, Serbia and Bulgaria take shape (Croatia becomes a\n'
                       'kingdom c. 925). Bulgaria is Christian; Magyars settle the Danube basin.')
for y, tribes in {-500: [('Thracian tribes',25.5,42.6),('Getae & Scythians',27.5,45.3)],
                  -323: [('Thracians & Getae',26.0,44.0),('Illyrians',19.0,43.8)],
                  -300: [('Getae',26.5,45.2),('Illyrians',19.0,43.8)],
                  -200: [('Thracians',25.5,42.6),('Dacians & Getae',25.0,45.5),('Illyrians',18.5,44.2)],
                  -100: [('Thracians',25.5,42.6),('Illyrians',17.5,45.0)],
                  14:   [('Germanic & Sarmatian tribes',21.0,47.2)],
                  200:  [('Sarmatians & Goths',27.5,46.8)],
                  300:  [('Goths & Sarmatians',24.5,46.8)],
                  400:  [('Huns & Goths',24.5,46.8)],
                  500:  [('Gepids',21.5,46.6),('Slavs & Antes',26.5,46.5)]}.items():
    _kf(y)['tribes'] = tribes

# 1210 replaces 1200: the Fourth Crusade
k1200 = _kf(1200)
k1200.update(year=1210, title='The Fourth Crusade',
    caption='Crusaders sack Constantinople (1204) and carve up Byzantium with\nVenice. Greek successor states rule from Nicaea and Arta.',
    rename={'Bulgar Khanate':'Second Bulgarian Empire','Croatia':'Croatia (Hungarian crown)'},
    over=[('Empire of Nicaea','nicaea'),('Latin Empire','latin_emp'),('Latin Empire','latin_asia'),
          ('Kingdom of Thessalonica','thessalonica_k'),('Despotate of Epirus','epirus_d'),
          ('Principality of Achaea','morea'),('Duchy of Athens','athens_d'),('Venice','crete'),('Venice','euboea')],
    caps=['Constantinople','Tarnovo','Esztergom','Nicaea','Arta','Thessalonica'], ragusa='venice')

KEYFRAMES.insert(_idx(1453) + 1, dict(year=1526, file='1492', title='Mohács',
    caption='Suleiman the Magnificent takes Belgrade (1521) and destroys the\nHungarian army at Mohács (1526). Buda falls in 1541.',
    rename={'Imperial Hungary':'Kingdom of Hungary','Aragón':'Naples (Spanish)'},
    over=[('Ottoman Empire','belgrade_1521'),('Venice','ven_dalm'),('Venice','kotor'),('Venice','crete'),
          ('Venice','corfu'),('Venice','kefalonia'),('Venice','zakynthos'),
          ('Wallachia (Ottoman vassal)','wallachia'),('Moldavia (Ottoman vassal)','moldavia')],
    caps=['Constantinople','Buda','Venice','Târgoviște','Suceava'], ragusa='rep'))

OTTO_BASE = [('Ottoman Empire','ne:Albania+North Macedonia+Kosovo+Greece+Bulgaria+Montenegro+Turkey'),
             ('Ottoman Empire','ne:Republic of Serbia&sb_clip_serbia')]
IONIAN_GR = [('Kingdom of Greece',k) for k in ('corfu','kefalonia','zakynthos','lefkada')]
kb = _kf(1878)
kb['rename'] = dict(kb['rename'], Bulgaria='Principality of Bulgaria')
kb.update(label='Jul 1878', tpos=1878.5, title='Congress of Berlin',
    caption='The powers cut "Big Bulgaria" back: a small principality, plus\nautonomous Eastern Rumelia. Serbia, Montenegro, Romania win independence.',
    over=OTTO_BASE + [('Kingdom of Greece','greece_1832')] + IONIAN_GR + [
          ('Principality of Serbia','ne:Republic of Serbia&serbia_1878'),('Montenegro','ne:Montenegro&monte_1878'),
          ('Principality of Bulgaria','ne:Bulgaria&bg_princ_1878'),
          ('Eastern Rumelia (Ottoman autonomy)','ne:Bulgaria&rumelia'),
          ('Bosnia (Austro-Hungarian)','ne:Bosnia and Herzegovina')],
    caps=['Constantinople','Vienna','Budapest','Belgrade','Cetinje','Bucharest','Sofia','Athens','Plovdiv'])
KEYFRAMES.insert(KEYFRAMES.index(kb), dict(year=1878, label='Mar 1878', tpos=1878.2, file='1880', title='Treaty of San Stefano',
    caption='Russia defeats the Ottomans and dictates a huge Bulgaria from\nthe Danube to the Aegean. Britain and Austria object.',
    rename={'Austria Hungary':'Austria-Hungary','Bulgaria':'Greater Bulgaria (San Stefano)'},
    over=OTTO_BASE + [('Ottoman Empire','ne:Bosnia and Herzegovina'),('Kingdom of Greece','greece_1832')] + IONIAN_GR + [
          ('Serbia','ne:Republic of Serbia&serbia_1878'),('Montenegro','ne:Montenegro&monte_1878'),
          ('Greater Bulgaria (San Stefano)','ne:Bulgaria+North Macedonia'),
          ('Greater Bulgaria (San Stefano)','ss_greek_part')],
    caps=['Constantinople','Vienna','Budapest','Belgrade','Cetinje','Bucharest','Sofia','Athens'], ragusa='austria'))

k13 = _kf(1913)
k13['over'] = [('Ottoman Empire','ne:Turkey'),('Greece','crete'),('Bulgaria','ne:Greece&w_thrace')]
k13['caption'] = ('The Ottomans lose almost all of Europe; they keep Edirne.\n'
                  'Albania is born. In 1914 a shot in Sarajevo starts the First World War.')

_kf(1938)['caption'] = ('Republican Turkey rules from Ankara (since 1923); kings rule\n'
                        'Yugoslavia, Romania, Bulgaria, Greece and Albania.')
KEYFRAMES.insert(_idx(1938) + 1, dict(year=1942, file='MODERN', title='Axis Occupation',
    caption='Germany and its allies invade in 1941. Yugoslavia is carved up and\nGreece occupied; resistance and civil war last until 1945.',
    rename={'Austria':'Nazi Germany','Republic of Serbia':'Serbia (German occupation)','Serbia':'Serbia (German occupation)',
            'Greece':'Greece (Axis occupation)','Moldova':'Romania','Kosovo':'Serbia (German occupation)',
            'Bosnia & Herzegovina':'Independent State of Croatia','Croatia':'Independent State of Croatia',
            'Montenegro':'Montenegro (Italian)','Albania':'Albania (Italian)','North Macedonia':'Bulgaria',
            'Slovenia':'Nazi Germany','Turkey':'Turkey (neutral)'},
    over=[('Italy','ne:Slovenia&slo_south'),('Hungary','ne:Slovenia&slo_north'),('Nazi Germany','ne:Slovenia&slo_north'),
          ('Independent State of Croatia','ne:Republic of Serbia&srem'),('Hungary','ne:Republic of Serbia&backa'),
          ('Hungary','ne:Romania&n_transylvania'),('Albania (Italian)','greater_alb'),
          ('Bulgaria','ne:Greece&bg_greek_thrace'),('Italy','dalm_1942'),('Italy','kotor'),
          ('Italy','corfu'),('Italy','kefalonia'),('Italy','zakynthos')],
    caps=['Zagreb','Belgrade','Sofia','Bucharest','Budapest','Athens','Tirana','Ankara'], ragusa='yugo'))

KEYFRAMES.insert(_idx(1995), dict(year=1992, file='MODERN', title='War and Independence',
    caption='Slovenia, Croatia, Bosnia and Macedonia break away (1991–92).\nWar follows in Croatia and Bosnia; Serbia and Montenegro form FR Yugoslavia.',
    rename={'Republic of Serbia':'FR Yugoslavia','Serbia':'FR Yugoslavia','Montenegro':'FR Yugoslavia',
            'Kosovo':'FR Yugoslavia','North Macedonia':'Macedonia','Bosnia & Herzegovina':'Bosnia & Herzegovina (at war)'},
    over=[('Serb-held areas (1991–95)','ne:Croatia&krajina_knin'),('Serb-held areas (1991–95)','ne:Croatia&krajina_ws'),
          ('Serb-held areas (1991–95)','ne:Croatia&krajina_es')],
    caps=['Belgrade','Zagreb','Ljubljana','Sarajevo','Skopje','Tirana','Sofia','Bucharest','Athens','Ankara','Budapest','Vienna'],
    ragusa='siege', zoom=(18.1,42.9)))
k95 = _kf(1995)
k95['title'] = 'Dayton'
k95['caption'] = ('Croatia retakes the Krajina (Aug 1995); the Dayton Agreement\n'
                  '(Nov 1995) ends the Bosnian war and splits Bosnia into two entities.')

# push-in zooms on the big upheavals (focus lon, lat)
for y, f in {1453:(26.0,41.5), 1526:(19.5,46.0), 1700:(19.0,45.5), 1810:(15.8,45.0), 1920:(20.0,44.5), 1942:(19.0,44.0)}.items():
    _kf(y)['zoom'] = f
kb['zoom'] = (24.5, 42.5)   # Berlin

def fmt_label(k):
    return k.get('label') or fmt_year(k['year'])
for k in KEYFRAMES:
    k.setdefault('tpos', k['year'])

P.update({
 'sicily_k': [(14.0,42.6),(16.2,42.0),(18.7,40.6),(18.7,39.5),(16.0,37.8),(15.4,36.4),(12.0,36.4),(12.0,38.4),(15.6,38.3),(14.8,40.0),(13.2,41.3),(13.6,42.0)],
 'thrace_bg_1210': [(23.4,42.2),(26.8,42.1),(26.4,41.4),(25.95,40.8),(24.4,40.7),(23.4,41.2)],
 'n_transylvania': [(21.9,47.95),(23.0,48.0),(24.9,47.9),(25.9,47.75),(26.0,47.3),(25.9,46.8),(26.4,46.3),(26.2,45.95),
                    (25.6,45.85),(25.0,46.25),(24.4,46.45),(23.6,46.62),(22.9,46.55),(22.4,46.75),(21.95,47.0),(21.6,47.1)],
})
_kf(1210)['over'] = [('Kingdom of Sicily','sicily_k'),('Second Bulgarian Empire','thrace_bg_1210')] + _kf(1210)['over']
_kf(1100)['over'] = [('Norman Kingdom of Sicily','sicily_k')]
_k92 = next(k for k in KEYFRAMES if k['year'] == 1992)
_k92['rename']['Bosnia & Herzegovina'] = 'Bosnia (at war)'

_kf(1210)['rename']['Byzantine Empire'] = 'Second Bulgarian Empire'
