// Copyright (c) 2023, 8848 Digital LLP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Hardware Testing", {
    setup(frm) {
        frm.set_query("print_format", function() {
            return {
                filters: {
                    raw_printing: 1
                }
            }
        })
        frm.set_query("html_print_format", function() {
            return {
                filters: {
                    raw_printing: 0
                }
            }
        })
    },
    refresh(frm) {
        frm.disable_save()
        frm.add_custom_button("Print", function() {
            frm.trigger('print')
        }).addClass("btn-primary")
    },
	onload(frm) {
        frm.set_value("print_type", "Raw Printing")
        frm.trigger("list_all_printers")
        frm.trigger("reset_options")
	},
    print_type(frm) {
        frm.trigger("reset_options")
    },
    reset_options(frm) {
        if(frm.doc.print_type == "Pixel Printing") {
            resetPixelOptions(frm)
        }
        else {
            resetRawOptions(frm)
        }
    },
    list_all_printers(frm) {
        frappe.ui.form.qz_init().then(function() {
            frappe.ui.form.qz_get_printer_list().then((data)=>{
                frm.set_df_property("select_printer", "options", data)
                let printers = frappe.render_template(template, {"data": data, "type": "Printers"})
                frm.get_field("available_printers").$wrapper.html(printers) 
            })
        })
    },
    open_cash_drawer(frm) {
        var config = qz.configs.create(frm.doc.select_printer);
        var data = [
            '\x10' + '\x14' + '\x01' + '\x00' + '\x05' //Generate Pulse to kick-out cash drawer
        ];
        qz.print(config, data);
    },
    print(frm) {
        // var config = qz.configs.create(frm.doc.select_printer)
        var config = updateConfig(frm)
        var opts = getUpdatedOptions(frm,true);
        config.setPrinter(frm.doc.select_printer)
        var printData 
        if (frm.doc.print_type == "Raw Printing") {
            printData = eval(frm.doc.raw_commands)
        }
        else {
            printData = [{
                type: 'pixel',
                format: 'html',
                flavor: 'plain',
                data: frappe.render_template(frm.doc.html),
                options: opts
            }]
        }
        console.log(config)
        qz.print(config, printData)
    },
    print_format(frm) {
        if (frm.doc.print_format) {
            frappe.db.get_value("Print Format", frm.doc.print_format, "raw_commands", (r)=> {
                frm.set_value("raw_commands", r.raw_commands)
            })
        }
    },
    html_print_format(frm) {
        if (frm.doc.html_print_format) {
            frappe.db.get_value("Print Format", frm.doc.html_print_format, "html", (r)=> {
                frm.set_value("html", r.html)
            })
        }
    },
    list_all_ports(frm) {
        qz.serial.findPorts().then((data) => {
            frm.set_df_property("port", "options", data)
                let ports = frappe.render_template(template, {"data": data, "type": "Ports"})
                frm.get_field("available_ports").$wrapper.html(ports) 
        })
    },
    open_port(frm) {
        var options = getSerialOptions(frm)
        qz.serial.openPort(frm.doc.port, options)
        $(`#${frappe.scrub(frm.doc.port)}`).addClass("text-success strong")
    },
    close_port(frm) {
        qz.serial.closePort(frm.doc.port)
        $(`#${frappe.scrub(frm.doc.port)}`).removeClass("text-success strong")
    },

    send_command(frm) {
        var options = getSerialOptions(frm)

        var serialData = {
            type: frm.doc.data_type?.toLowerCase(),
            data: frm.doc.cmd
        }

        var fromHex = function(m, s1) {
            return String.fromCharCode(parseInt(s1, 16));
        };

        //allow some escape characters (newlines, tabs, hex/unicode)
        serialData.data = serialData.data.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
            .replace(/\\x([0-9A-Za-z]{2})/g, fromHex).replace(/\\u([0-9A-Za-z]{4})/g, fromHex);

        qz.serial.sendData(frm.doc.port, '\f')
        qz.serial.sendData(frm.doc.port, serialData, options)
    },
    clear_screen(frm) {
        qz.serial.sendData(frm.doc.port, '\f')
    },
    reset_serial(frm) {
        resetSerialOptions(frm)
    }
});

// for custom triggers on tab switch
var a = document.getElementById('hardware-testing-serial_tab-tab');
a.addEventListener('click', e => {
    $('Button[data-fieldname="send_command"]').addClass("btn-primary")
    cur_frm.remove_custom_button("Print")
    cur_frm.trigger("reset_serial")
});

var b = document.getElementById('hardware-testing-printing_tab-tab');
b.addEventListener('click', () => {
    cur_frm.add_custom_button("Print", function() {
        cur_frm.trigger('print')
    }).addClass("btn-primary")
});

var template = `
<h3>List of Available {{ type }}</h3>
<ul>
{% for row in data %}
<li id={{frappe.scrub(row)}}>{{ row }}</li>
{% endfor %}
</ul>`

function updateConfig(frm, cfg = null) {
    if (cfg == null) {
        cfg = qz.configs.create(null);
    }
    var pxlSize = null;
    if (frm.doc.size && (!frm.doc.width || !frm.doc.height)) {
        pxlSize = {
            width: frm.doc.width,
            height: frm.doc.height
        };
    }

    var pxlBounds = null;
    if (frm.doc.bounds) {
        pxlBounds = {
            x: frm.doc.x,
            y: frm.doc.y,
            width: frm.doc.b_width,
            height: frm.doc.b_height
        };
    }

    var pxlDensity = frm.doc.density;
    if (frm.doc.density_asymmetric) {
        pxlDensity = {
            cross: frm.doc.cross,
            feed: frm.doc.feed
        };
    }

    var pxlMargins = frm.doc.margins;
    if (frm.doc.individual_margin) {
        pxlMargins = {
            top: frm.doc.top,
            right: frm.doc.right,
            bottom: frm.doc.bottom,
            left: frm.doc.left
        };
    }

    var copies = frm.doc.copies || 1;
    var spoolSize = (frm.doc.print_type == 'Raw Printing') ? 1: frm.doc.per_spool;
    var jobName = frm.doc.job_name;

    cfg.reconfigure({
                        forceRaw: frm.doc.force_raw,
                        encoding: frm.doc.encoding,
                        spool: { size: spoolSize, end: frm.doc.end_of_doc },
                        bounds: pxlBounds,
                        colorType: (frm.doc.color_type || "").toLowerCase(),
                        copies: copies,
                        density: pxlDensity,
                        duplex: frm.doc.duplex == "Single Sided"? false: frm.doc.duplex,
                        interpolation: (frm.doc.interpolation || "").toLowerCase(),
                        jobName: jobName,
                        margins: pxlMargins,
                        orientation: (frm.doc.orientation || "").toLowerCase(),
                        // paperThickness: frm.doc.paper_thickness,
                        printerTray: frm.doc.printer_tray,
                        rasterize: frm.doc.rasterize,
                        rotation: frm.doc.rotation,
                        scaleContent: frm.doc.scale_content,
                        size: pxlSize,
                        units: frm.doc.units?.toLowerCase()
                    });

    return cfg
}

function getUpdatedOptions(frm,onlyPixel) {
    if (onlyPixel) {
        return {
            pageWidth: frm.doc.render_width,
            pageHeight: frm.doc.render_height,
            pageRanges: frm.doc.page_ranges,
            ignoreTransparency: frm.doc.ignore_transparency
        };
    } else {
        return {
            language: frm.doc.language,
            x: frm.doc.x,
            y: frm.doc.y,
            dotDensity: frm.doc.dot_density,
            xmlTag: frm.doc.xml_tag,
            pageWidth: frm.doc.render_width,
            pageHeight: frm.doc.render_height
        };
    }
}

function resetRawOptions(frm) {
    //config
    frm.set_value({
        "per_spool": 1,
        "encoding": null,
        "end_of_doc": null,
        "force_raw": 0,
        "copies": 1,
        "orientation": "Portrait",

    })

    //printer
    frm.set_value({
        "x": 0,
        "y": 0,
        "dot_density": "single",
        "xml_tag": "v7:Image",
        "render_width": 480,
        "render_height": 0 
    })
}

function resetPixelOptions(frm) {
    //config
    frm.set_value({
        "color_type": "Color",
        "copies": 1,
        "duplex": "Single Sided",
        "interpolation": null,
        "job_name": null,
        "legacy_printing": 0,
        "orientation": "Portrait",
        "printer_tray": null,
        "rasterize": 0,
        "rotation": 0,
        "per_spool": 0,
        "scale_content": 1,
        "units": "in",

        "density": null,
        "cross": 0,
        "feed": 0,
        "density_asymmetric": 0,

        "margins": 0,
        "top": 0,
        "bottom": 0,
        "left": 0,
        "right": 0,
        "individual_margin": 0,

        "size": 0,
        "width": 0,
        "height": 0,

        "bounds": 0,
        "b_width": 0,
        "b_height": 0,
        "x": 0,
        "y": 0
    })
    
    //printer
    frm.set_value({
        "render_width": 0,
        "render_height": 0,
        "page_ranges": null,
        "ignore_transparency": 0
    })
}

function resetSerialOptions(frm) {
    frm.set_value({
        "baud_rate": 9600,
        "data_bits": 8,
        "stop_bits": 1,
        "parity": "NONE",
        "flow_control": "NONE",
        "cmd": null,
        "data_type": "Plain",
        "s_encoding": "UTF-8",
        "start_bytes": null,
        "end_bytes": null,
        "s_width": 0,
        "include_header": 0,
        "r_encoding": "UTF-8",
        "index": 0,
        "length": 1,
        "endian": "Big",
        "enable_length_bytes": 0,
        "enable_crc_bytes":0,
        "crc_index": 0,
        "crc_length": 1
    })
}

function getSerialOptions(frm) {
    var options = {
        baudRate: frm.doc.baud_rate,
        dataBits: frm.doc.data_bits,
        stopBits: frm.doc.stop_bits,
        parity: frm.doc.parity,
        flowControl: frm.doc.flow_control,
        encoding: frm.doc.s_encoding || null,
        rx: {
            start: frm.doc.start_bytes,
            end: frm.doc.end_bytes || null,
            width: frm.doc.s_width || null,
            untilNewline: frm.doc.wait_for_new_line,
            lengthBytes: null,
            crcBytes: null,
            includeHeader: frm.doc.include_header,
            encoding: frm.doc.r_encoding
        }
    };
    if (frm.doc.enable_length_bytes) {
        options.rx.lengthBytes = {
            index: frm.doc.index,
            length: frm.doc.length,
            endian: frm.doc.endian?.toLowerCase()
        };
    }
    if (frm.doc.enable_crc_bytes) {
        options.rx.crcBytes = {
            index: frm.doc.crc_index,
            length: frm.doc.crc_length
        };
    }

    return options;
}