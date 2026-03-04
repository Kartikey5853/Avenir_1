"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "./card"
import { Badge } from "./badge"
import { CheckCircle, Clock, Circle } from "lucide-react"

export interface TimelineItem {
  title: string
  description: string
  date?: string
  image?: string
  status?: "completed" | "current" | "upcoming"
  category?: string
}

export interface TimelineProps {
  items: TimelineItem[]
  className?: string
}

const getStatusConfig = (status: TimelineItem["status"]) => {
  const configs = {
    completed: {
      progressColor: "bg-green-500",
      borderColor: "border-green-500/20",
      badgeBg: "bg-green-500/10",
      badgeText: "text-green-700 dark:text-green-400",
    },
    current: {
      progressColor: "bg-blue-600 dark:bg-blue-400",
      borderColor: "border-blue-600/20 dark:border-blue-400/20",
      badgeBg: "bg-blue-100 dark:bg-blue-900/30",
      badgeText: "text-blue-800 dark:text-blue-200",
    },
    upcoming: {
      progressColor: "bg-yellow-500",
      borderColor: "border-yellow-500/20",
      badgeBg: "bg-yellow-500/10",
      badgeText: "text-yellow-700 dark:text-yellow-400",
    },
  }
  return configs[status || "upcoming"]
}

const getStatusIcon = (status: TimelineItem["status"]) => {
  switch (status) {
    case "completed": return CheckCircle
    case "current": return Clock
    default: return Circle
  }
}

export function Timeline({ items, className }: TimelineProps) {
  if (!items || items.length === 0) {
    return (
      <div className={cn("w-full max-w-4xl mx-auto px-4 sm:px-6 py-8", className)}>
        <p className="text-center text-muted-foreground">No timeline items to display</p>
      </div>
    )
  }

  return (
    <section
      className={cn("w-full max-w-4xl mx-auto px-4 sm:px-6 py-4", className)}
      role="list"
      aria-label="Timeline"
    >
      <div className="relative">
        <div className="absolute left-4 sm:left-6 top-0 bottom-0 w-px bg-border" aria-hidden="true" />

        <motion.div
          className="absolute left-4 sm:left-6 top-0 w-px bg-primary origin-top"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1, transition: { duration: 1.2, ease: "easeOut", delay: 0.2 } }}
          viewport={{ once: true }}
          aria-hidden="true"
        />

        <div className="space-y-8 sm:space-y-10 relative">
          {items.map((item, index) => {
            const config = getStatusConfig(item.status)
            const IconComponent = getStatusIcon(item.status)

            return (
              <motion.div
                key={index}
                className="relative group"
                initial={{ opacity: 0, y: 30, scale: 0.98 }}
                whileInView={{
                  opacity: 1, y: 0, scale: 1,
                  transition: { duration: 0.45, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] },
                }}
                viewport={{ once: true, margin: "-30px" }}
                role="listitem"
              >
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="relative flex-shrink-0">
                    <motion.div whileHover={{ scale: 1.05 }} transition={{ duration: 0.2 }}>
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border-2 border-background shadow-lg relative z-10">
                        {item.image ? (
                          <img src={item.image} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <IconComponent className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/70" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>

                  <motion.div className="flex-1 min-w-0" whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                    <Card className={cn(
                      "border transition-all duration-300 hover:shadow-md",
                      "bg-card/50 backdrop-blur-sm",
                      config.borderColor,
                      "group-hover:border-primary/30"
                    )}>
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base sm:text-lg font-semibold text-foreground mb-0.5 group-hover:text-primary transition-colors duration-300">
                              {item.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {item.category && <span className="font-medium">{item.category}</span>}
                              {item.category && item.date && <span className="w-1 h-1 bg-muted-foreground rounded-full" aria-hidden="true" />}
                              {item.date && <time dateTime={item.date}>{item.date}</time>}
                            </div>
                          </div>
                          <Badge
                            className={cn("w-fit text-xs font-medium border shrink-0", config.badgeBg, config.badgeText, "border-current/20")}
                          >
                            {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : "Upcoming"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <motion.div
          className="absolute left-4 sm:left-6 -bottom-4 transform -translate-x-1/2"
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1, transition: { duration: 0.4, delay: items.length * 0.1 + 0.3, type: "spring", stiffness: 400 } }}
          viewport={{ once: true }}
          aria-hidden="true"
        >
          <div className="w-3 h-3 bg-primary rounded-full shadow-sm" />
        </motion.div>
      </div>
    </section>
  )
}
